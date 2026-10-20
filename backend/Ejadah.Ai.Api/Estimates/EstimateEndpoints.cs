using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Estimates;

public static class EstimateEndpoints
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static void MapEstimateEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/estimates").WithTags("Estimates");

        g.MapPost("/", async (EstimateRequest req, Db db, CancellationToken ct) =>
        {
            var errors = req.Validate();
            if (errors.Count > 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = errors.ToArray() });

            var district = await db.SingleOrDefaultAsync<(int CityId, bool IsUnknown)>(
                "select city_id, is_unknown from market.districts where id = @id", new { id = req.DistrictId }, ct);
            if (district == default || district.CityId != req.CityId) return Results.ValidationProblem(new Dictionary<string, string[]> { ["districtId"] = ["الحي لا يتبع المدينة المختارة"] });
            if (district.IsUnknown) return Results.ValidationProblem(new Dictionary<string, string[]> { ["districtId"] = ["اختر حياً محدداً"] });

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
                insert into app.valuations (city_id, district_id, type_group, area_m2, plan_no, plot_no, request, result, confidence, level_used, sample_size, duration_ms)
                values (@cityId, @districtId, @type, @area, @plan, @plot, @request::jsonb, @result::jsonb, @confidence, @level, @sample, @ms)
                returning id
                """,
                new
                {
                    cityId = req.CityId, districtId = req.DistrictId, type = req.PropertyType, area = req.AreaM2, plan = req.PlanNo, plot = req.PlotNo,
                    request = JsonSerializer.Serialize(req, Json), result = resultJson, confidence, level, sample, ms = (int)sw.ElapsedMilliseconds,
                }, ct);

            // gross yield as information only (spec 6.5 step 6)
            decimal? grossYield = null;
            if (req.AnnualIncome is > 0 && root.TryGetProperty("total_estimate", out var te) && te.ValueKind == JsonValueKind.Number && te.GetDecimal() > 0)
                grossYield = Math.Round(100m * req.AnnualIncome.Value / te.GetDecimal(), 2);

            return Results.Created($"/api/estimates/{id}", new EstimateResponse(id, req, root.Clone(), grossYield, (int)sw.ElapsedMilliseconds));
        }).WithSummary("تسعير عقار: يشغّل محرك التسعير ويحفظ النتيجة");

        g.MapGet("/{id:guid}", async (Guid id, Db db, CancellationToken ct) =>
        {
            var row = await db.SingleOrDefaultAsync<(string Request, string Result, int? DurationMs, DateTime CreatedAt)>(
                "select request::text, result::text, duration_ms, created_at from app.valuations where id = @id", new { id }, ct);
            if (row == default) return Results.NotFound();
            var req = JsonSerializer.Deserialize<EstimateRequest>(row.Request, Json)!;
            using var doc = JsonDocument.Parse(row.Result);
            return Results.Ok(new EstimateResponse(id, req, doc.RootElement.Clone(), null, row.DurationMs ?? 0) { CreatedAt = row.CreatedAt });
        }).WithSummary("قراءة تسعير محفوظ");

        g.MapGet("/", async (int? limit, Db db, CancellationToken ct) =>
            Results.Ok(await db.QueryAsync<ValuationSummary>(
                """
                select v.id, v.created_at, v.type_group, v.area_m2, c.name as city, d.name as district, v.confidence,
                       (v.result->>'ppm_estimate')::numeric as ppm_estimate, (v.result->>'total_estimate')::numeric as total_estimate
                from app.valuations v join market.cities c on c.id = v.city_id left join market.districts d on d.id = v.district_id
                order by v.created_at desc limit @limit
                """, new { limit = Math.Clamp(limit ?? 20, 1, 100) }, ct)))
         .WithSummary("آخر التسعيرات (مؤقتاً بلا مستخدم حتى تُضاف المصادقة)");
    }
}

public sealed record EstimateResponse(Guid Id, EstimateRequest Request, JsonElement Result, decimal? GrossYieldPct, int DurationMs)
{
    public DateTime? CreatedAt { get; init; }
}

public sealed record ValuationSummary(Guid Id, DateTime CreatedAt, string TypeGroup, decimal AreaM2, string City, string? District,
                                      string Confidence, decimal? PpmEstimate, decimal? TotalEstimate);
