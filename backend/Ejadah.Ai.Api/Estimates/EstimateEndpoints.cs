using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Estimates;

public static class EstimateEndpoints
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static void MapEstimateEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/estimates").WithTags("Estimates").RequireAuthorization(Capabilities.PriceEstimate);

        g.MapPost("/", async (EstimateRequest req, HttpContext http, Db db, CancellationToken ct) =>
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

            var id = await db.ScalarAsync<Guid>(
                """
                insert into app.valuations (seat_id, account_id, city_id, district_id, type_group, area_m2, plan_no, plot_no, request, result, confidence, level_used, sample_size, duration_ms)
                values (@seatId, @accountId, @cityId, @districtId, @type, @area, @plan, @plot, @request::jsonb, @result::jsonb, @confidence, @level, @sample, @ms)
                returning id
                """,
                new
                {
                    seatId, accountId, cityId = req.CityId, districtId = req.DistrictId, type = req.PropertyType, area = req.AreaM2, plan = req.PlanNo, plot = req.PlotNo,
                    request = JsonSerializer.Serialize(req, Json), result = resultJson, confidence, level, sample, ms = (int)sw.ElapsedMilliseconds,
                }, ct);

            // gross yield as information only (spec 6.5 step 6)
            decimal? grossYield = null;
            if (req.AnnualIncome is > 0 && root.TryGetProperty("total_estimate", out var te) && te.ValueKind == JsonValueKind.Number && te.GetDecimal() > 0)
                grossYield = Math.Round(100m * req.AnnualIncome.Value / te.GetDecimal(), 2);

            await AuthEndpoints.Audit(db, "seat", seatId, "estimate.created", id.ToString(), http, new { req.PropertyType, req.CityId, req.DistrictId, confidence }, ct);
            return Results.Created($"/api/estimates/{id}", new EstimateResponse(id, req, root.Clone(), grossYield, (int)sw.ElapsedMilliseconds));
        }).WithSummary("تسعير عقار: يشغّل محرك التسعير ويحفظ النتيجة");

        g.MapGet("/{id:guid}", async (Guid id, HttpContext http, Db db, CancellationToken ct) =>
        {
            var row = await db.SingleOrDefaultAsync<(string Request, string Result, int? DurationMs, DateTime CreatedAt)>(
                "select request::text, result::text, duration_ms, created_at from app.valuations where id = @id and (seat_id = @seatId or account_id = @accountId)",
                new { id, seatId = http.User.PrincipalId(), accountId = http.User.AccountId() }, ct);
            if (row == default) return Results.NotFound();
            var req = JsonSerializer.Deserialize<EstimateRequest>(row.Request, Json)!;
            using var doc = JsonDocument.Parse(row.Result);
            return Results.Ok(new EstimateResponse(id, req, doc.RootElement.Clone(), null, row.DurationMs ?? 0) { CreatedAt = row.CreatedAt });
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
}

public sealed record EstimateResponse(Guid Id, EstimateRequest Request, JsonElement Result, decimal? GrossYieldPct, int DurationMs)
{
    public DateTime? CreatedAt { get; init; }
}

public sealed record ValuationSummary(Guid Id, DateTime CreatedAt, string TypeGroup, decimal AreaM2, string City, string? District,
                                      string Confidence, decimal? PpmEstimate, decimal? TotalEstimate);
