using System.Diagnostics;
using System.Security.Claims;
using System.Text.Json;
using Ejadah.Ai.Api.Ai;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Estimates;

/// <summary>One price request: validate → daily limit → engine → rule lines → AI reading of the notes → save.</summary>
public sealed class PricingService(Db db, INotesAssessor ai, ILoggerFactory logs)
{
    private readonly ILogger _aiLog = logs.CreateLogger("Ejadah.Ai");

    // daily limit per seat (plan) — spec 9.2; the day turns at midnight Riyadh time. Admins have no seat row, so no limit.
    private const string QuotaSql = """
        select coalesce(p.daily_estimate_limit, 50) as limit,
               (select count(*)::int from app.valuations v
                 where v.seat_id = s.id and v.created_at >= date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh') as used
        from identity.seats s join identity.accounts a on a.id = s.account_id left join identity.plans_catalog p on p.id = a.plan_id
        where s.id = @seatId
        """;

    public async Task<IResult> EstimateAsync(EstimateRequest req, ClaimsPrincipal user, HttpContext http, CancellationToken ct)
    {
        var seatId = user.SeatId(); var adminId = user.AdminId(); var accountId = user.AccountId();
        var errors = req.Validate();
        if (errors.Count > 0) return Problems.Invalid(errors);

        var district = await db.SingleOrDefaultAsync<(int CityId, bool IsUnknown)>(
            "select city_id, is_unknown from market.districts where id = @id", new { id = req.DistrictId }, ct);
        if (district == default || district.CityId != req.CityId) return Problems.Invalid("districtId", "الحي لا يتبع المدينة المختارة");
        if (district.IsUnknown) return Problems.Invalid("districtId", "اختر حياً محدداً");

        // checked first so a seat at its limit costs no engine or AI work; checked again under a lock when saving
        if (seatId is not null)
        {
            var quota = await db.SingleOrDefaultAsync<(int Limit, int Used)>(QuotaSql, new { seatId }, ct);
            if (quota != default && quota.Used >= quota.Limit) return DailyLimit(quota.Limit);
        }

        var sw = Stopwatch.StartNew();
        var resultJson = await db.ScalarAsync<string>(
            """
            select market.estimate_price(@cityId, @districtId, @type, @area,
                                         market.normalize_code(@plan), market.normalize_code(@plot))::text
            """,
            new { cityId = req.CityId, districtId = req.DistrictId, type = req.PropertyType, area = req.AreaM2, plan = req.PlanNo, plot = req.PlotNo }, ct);
        sw.Stop();
        if (resultJson is null) return Results.Problem("pricing engine returned nothing", statusCode: 500);

        using var doc = JsonDocument.Parse(resultJson);
        var root = doc.RootElement;
        var confidence = root.GetProperty("confidence").GetString() ?? "insufficient";
        int? level = root.TryGetProperty("level_used", out var l) && l.ValueKind == JsonValueKind.Number ? l.GetInt32() : null;
        int? sample = root.TryGetProperty("sample_size", out var s) && s.ValueKind == JsonValueKind.Number ? s.GetInt32() : null;

        // market price -> age / floors / features from the admin table -> AI reading of the notes -> one final price
        var marketPpm = Num(root, "ppm_estimate");
        var marketTotal = Num(root, "total_estimate");
        var items = req.PropertyType == "land" ? [] : Adjustments.Evaluate(req, await Adjustments.RulesAsync(db, req.PropertyType, ct));
        var caps = await Adjustments.CapsAsync(db, ct);

        NotesAssessment? assessment = null;
        AiCallLog? aiLog = null;
        if (!string.IsNullOrWhiteSpace(req.Notes) && marketTotal > 0)
        {
            var names = await db.SingleOrDefaultAsync<(string City, string District)>(
                "select c.name, d.name from market.districts d join market.cities c on c.id = d.city_id where d.id = @id", new { id = req.DistrictId }, ct);
            var input = new NotesInput(req.PropertyType, names.City, names.District, req.AreaM2, req.AgeYears, req.Floors, req.Units,
                req.AnnualIncome, req.Features, req.Notes.Trim(), marketTotal.Value, marketPpm ?? 0, caps.AiMaxPct);
            // any AI failure returns no assessment: the price is never held back by the AI
            (assessment, aiLog) = await AiCall.RunAsync("assess-notes", ai.Provider, t => ai.AssessAsync(input, t),
                (a, ms) => new AiCallLog("assess-notes", ai.Provider, a.Model, true, ms, a.InputTokens, a.OutputTokens, null,
                                         JsonSerializer.Serialize(a, EstimateEndpoints.Json)), _aiLog, ct);
        }

        var pricing = Adjustments.Build(marketPpm, marketTotal, items, caps.RulesMaxTotalPct, assessment?.Pct, assessment?.Reason);
        if (pricing is not null && assessment is not null)
            pricing = pricing with { AiItems = assessment.Items, AiProvider = assessment.Provider };

        // the valuation, its AI call and the audit row commit together; the seat row lock makes parallel requests
        // count the day's estimates one after another, so the limit cannot be passed by sending them at once
        var (id, limit) = await db.InTransactionAsync<(Guid? Id, int Limit)>(async tx =>
        {
            if (seatId is not null)
            {
                // lock first, count in the next statement: a statement that waited for the lock keeps its old snapshot,
                // so a count in the locking statement itself would miss the estimate committed while it waited
                await tx.ExecuteAsync("select 1 from identity.seats where id = @seatId for update", new { seatId }, ct);
                var quota = await tx.SingleOrDefaultAsync<(int Limit, int Used)>(QuotaSql, new { seatId }, ct);
                if (quota != default && quota.Used >= quota.Limit) return (null, quota.Limit);
            }
            var id = await tx.ScalarAsync<Guid>(
                """
                insert into app.valuations (seat_id, admin_id, account_id, city_id, district_id, type_group, area_m2, plan_no, plot_no, request, result, confidence, level_used, sample_size, duration_ms, adjustments, ai_adjustment)
                values (@seatId, @adminId, @accountId, @cityId, @districtId, @type, @area, @plan, @plot, @request::jsonb, @result::jsonb, @confidence, @level, @sample, @ms, @adjustments::jsonb, @ai::jsonb)
                returning id
                """,
                new
                {
                    seatId, adminId, accountId, cityId = req.CityId, districtId = req.DistrictId, type = req.PropertyType, area = req.AreaM2, plan = req.PlanNo, plot = req.PlotNo,
                    request = JsonSerializer.Serialize(req, EstimateEndpoints.Json), result = resultJson, confidence, level, sample, ms = (int)sw.ElapsedMilliseconds,
                    adjustments = pricing is null ? null : JsonSerializer.Serialize(pricing, EstimateEndpoints.Json),
                    ai = assessment is null ? null : JsonSerializer.Serialize(assessment, EstimateEndpoints.Json),
                }, ct);
            if (aiLog is not null) await (aiLog with { SeatId = seatId, AdminId = adminId, ValuationId = id }).SaveAsync(tx, ct);
            await Audit.WriteAsync(tx, user.Kind(), user.PrincipalId(), "estimate.created", id.ToString(), http, new { req.PropertyType, req.CityId, req.DistrictId, confidence }, ct);
            return (id, 0);
        }, ct);
        if (id is null) return DailyLimit(limit);

        // gross yield as information only (spec 6.5 step 6)
        decimal? grossYield = null;
        if (req.AnnualIncome is > 0 && pricing?.FinalTotal > 0)
            grossYield = Math.Round(100m * req.AnnualIncome.Value / pricing.FinalTotal, 2);

        return Results.Created($"/api/estimates/{id}", new EstimateResponse(id.Value, req, root.Clone(), grossYield, (int)sw.ElapsedMilliseconds) { Pricing = pricing });
    }

    private static IResult DailyLimit(int limit) =>
        Results.Problem(title: $"وصلت إلى الحد اليومي ({limit} تسعيرة). يتجدد الحد منتصف الليل بتوقيت الرياض", statusCode: 429, type: "daily_limit");

    private static decimal? Num(JsonElement root, string name) =>
        root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;
}
