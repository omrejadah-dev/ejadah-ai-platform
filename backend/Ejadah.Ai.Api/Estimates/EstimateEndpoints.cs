using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Ejadah.Ai.Api.Ai;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Estimates;

public static class EstimateEndpoints
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static void MapEstimateEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/estimates").WithTags("Estimates").RequireAuthorization(Capabilities.PriceEstimate);

        g.MapPost("/", async (EstimateRequest req, HttpContext http, Db db, INotesAssessor ai, ILoggerFactory logs, CancellationToken ct) =>
        {
            var seatId = http.User.PrincipalId(); var accountId = http.User.AccountId();
            var errors = req.Validate();
            if (errors.Count > 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = errors.ToArray() });

            var district = await db.SingleOrDefaultAsync<(int CityId, bool IsUnknown)>(
                "select city_id, is_unknown from market.districts where id = @id", new { id = req.DistrictId }, ct);
            if (district == default || district.CityId != req.CityId) return Results.ValidationProblem(new Dictionary<string, string[]> { ["districtId"] = ["الحي لا يتبع المدينة المختارة"] });
            if (district.IsUnknown) return Results.ValidationProblem(new Dictionary<string, string[]> { ["districtId"] = ["اختر حياً محدداً"] });

            // daily limit per seat (plan) — spec 9.2
            var quota = await db.SingleOrDefaultAsync<(int Limit, int Used)>(
                """
                select coalesce(p.daily_estimate_limit, 50), (select count(*) from app.valuations v where v.seat_id = @seatId and v.created_at >= date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh')
                from identity.seats s join identity.accounts a on a.id = s.account_id left join identity.plans_catalog p on p.id = a.plan_id where s.id = @seatId
                """, new { seatId }, ct);
            if (quota != default && quota.Used >= quota.Limit)
                return Results.Problem(title: $"وصلت إلى الحد اليومي ({quota.Limit} تسعيرة). يتجدد الحد منتصف الليل بتوقيت الرياض", statusCode: 429, type: "daily_limit");

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
            var rulesCap = await Adjustments.SettingAsync(db, "rules_max_total_pct", 30, ct);

            NotesAssessment? assessment = null;
            AiCallLog? aiLog = null;
            if (!string.IsNullOrWhiteSpace(req.Notes) && marketTotal > 0)
            {
                var names = await db.SingleOrDefaultAsync<(string City, string District)>(
                    "select c.name, d.name from market.districts d join market.cities c on c.id = d.city_id where d.id = @id", new { id = req.DistrictId }, ct);
                var input = new NotesInput(req.PropertyType, names.City, names.District, req.AreaM2, req.AgeYears, req.Floors, req.Units,
                    req.AnnualIncome, req.Features, req.Notes.Trim(), marketTotal.Value, marketPpm ?? 0,
                    await Adjustments.SettingAsync(db, "ai_max_pct", 15, ct));
                (assessment, aiLog) = await AssessNotes(ai, input, logs.CreateLogger("Ejadah.Ai"), ct);
            }

            var pricing = Adjustments.Build(marketPpm, marketTotal, items, rulesCap, assessment?.Pct, assessment?.Reason);
            if (pricing is not null && assessment is not null)
                pricing = pricing with { AiItems = assessment.Items, AiProvider = assessment.Provider };

            var id = await db.ScalarAsync<Guid>(
                """
                insert into app.valuations (seat_id, account_id, city_id, district_id, type_group, area_m2, plan_no, plot_no, request, result, confidence, level_used, sample_size, duration_ms, adjustments, ai_adjustment)
                values (@seatId, @accountId, @cityId, @districtId, @type, @area, @plan, @plot, @request::jsonb, @result::jsonb, @confidence, @level, @sample, @ms, @adjustments::jsonb, @ai::jsonb)
                returning id
                """,
                new
                {
                    seatId, accountId, cityId = req.CityId, districtId = req.DistrictId, type = req.PropertyType, area = req.AreaM2, plan = req.PlanNo, plot = req.PlotNo,
                    request = JsonSerializer.Serialize(req, Json), result = resultJson, confidence, level, sample, ms = (int)sw.ElapsedMilliseconds,
                    adjustments = pricing is null ? null : JsonSerializer.Serialize(pricing, Json),
                    ai = assessment is null ? null : JsonSerializer.Serialize(assessment, Json),
                }, ct);
            if (aiLog is not null) await (aiLog with { SeatId = seatId, ValuationId = id }).SaveAsync(db, ct);

            // gross yield as information only (spec 6.5 step 6)
            decimal? grossYield = null;
            if (req.AnnualIncome is > 0 && pricing?.FinalTotal > 0)
                grossYield = Math.Round(100m * req.AnnualIncome.Value / pricing.FinalTotal, 2);

            await AuthEndpoints.Audit(db, "seat", seatId, "estimate.created", id.ToString(), http, new { req.PropertyType, req.CityId, req.DistrictId, confidence }, ct);
            return Results.Created($"/api/estimates/{id}", new EstimateResponse(id, req, root.Clone(), grossYield, (int)sw.ElapsedMilliseconds) { Pricing = pricing });
        }).RequireRateLimiting(RateLimits.Estimate).WithSummary("تسعير عقار: يشغّل محرك التسعير ويحفظ النتيجة");

        g.MapGet("/{id:guid}", async (Guid id, HttpContext http, Db db, CancellationToken ct) =>
        {
            var row = await db.SingleOrDefaultAsync<(string Request, string Result, int? DurationMs, DateTime CreatedAt, string? Adjustments)>(
                "select request::text, result::text, duration_ms, created_at, adjustments::text from app.valuations where id = @id and (seat_id = @seatId or account_id = @accountId)",
                new { id, seatId = http.User.PrincipalId(), accountId = http.User.AccountId() }, ct);
            if (row == default) return Results.NotFound();
            var req = JsonSerializer.Deserialize<EstimateRequest>(row.Request, Json)!;
            using var doc = JsonDocument.Parse(row.Result);
            var pricing = row.Adjustments is null ? null : JsonSerializer.Deserialize<PricingBreakdown>(row.Adjustments, Json);
            return Results.Ok(new EstimateResponse(id, req, doc.RootElement.Clone(), null, row.DurationMs ?? 0) { CreatedAt = row.CreatedAt, Pricing = pricing });
        }).WithSummary("قراءة تسعير محفوظ");

        g.MapGet("/", async (int? limit, HttpContext http, Db db, CancellationToken ct) =>
            Results.Ok(await db.QueryAsync<ValuationSummary>(
                """
                select v.id, v.created_at, v.type_group, v.area_m2, c.name as city, d.name as district, v.confidence,
                       (v.result->>'ppm_estimate')::numeric as ppm_estimate, (v.result->>'total_estimate')::numeric as total_estimate
                from app.valuations v join market.cities c on c.id = v.city_id left join market.districts d on d.id = v.district_id
                where v.seat_id = @seatId
                order by v.created_at desc limit @limit
                """, new { seatId = http.User.PrincipalId(), limit = Math.Clamp(limit ?? 20, 1, 100) }, ct)))
         .WithSummary("تسعيراتي: آخر تسعيرات المقعد الحالي");
    }

    private static decimal? Num(JsonElement root, string name) =>
        root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;

    private static readonly TimeSpan AiTimeout = TimeSpan.FromSeconds(20);

    /// <summary>Runs the notes reading with a time limit. Any failure returns no assessment: the price is never held back by the AI.</summary>
    private static async Task<(NotesAssessment?, AiCallLog)> AssessNotes(INotesAssessor ai, NotesInput input, ILogger log, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(AiTimeout);
        try
        {
            var a = await ai.AssessAsync(input, cts.Token);
            return (a, new AiCallLog("assess-notes", ai.Provider, a.Model, true, (int)sw.ElapsedMilliseconds, a.InputTokens, a.OutputTokens, null,
                                     JsonSerializer.Serialize(a, Json)));
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "assess-notes failed after {Ms} ms; pricing continues without the AI line", sw.ElapsedMilliseconds);
            var error = ex is OperationCanceledException ? "timeout" : ex.GetType().Name + ": " + ex.Message;
            return (null, new AiCallLog("assess-notes", ai.Provider, null, false, (int)sw.ElapsedMilliseconds, null, null, error, null));
        }
    }

}

public sealed record EstimateResponse(Guid Id, EstimateRequest Request, JsonElement Result, decimal? GrossYieldPct, int DurationMs)
{
    public DateTime? CreatedAt { get; init; }
    /// <summary>Market price, adjustment lines and the single final price. Null when the engine had too few deals.</summary>
    public PricingBreakdown? Pricing { get; init; }
}

public sealed record ValuationSummary(Guid Id, DateTime CreatedAt, string TypeGroup, decimal AreaM2, string City, string? District,
                                      string Confidence, decimal? PpmEstimate, decimal? TotalEstimate);
