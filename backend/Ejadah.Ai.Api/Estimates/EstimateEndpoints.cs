using System.Text.Json;
using System.Text.Json.Serialization;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Estimates;

public static class EstimateEndpoints
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static void MapEstimateEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/estimates").WithTags("Estimates").RequireAuthorization(Capabilities.PriceEstimate);

        g.MapPost("/", (EstimateRequest req, HttpContext http, PricingService pricing, CancellationToken ct) =>
            pricing.EstimateAsync(req, http.User, http, ct))
         .RequireRateLimiting(RateLimits.Estimate).WithSummary("تسعير عقار: يشغّل محرك التسعير ويحفظ النتيجة");

        // a seat reads its own and its account's estimates; an admin reads the ones it made (admin_id, 019)
        g.MapGet("/{id:guid}", async (Guid id, HttpContext http, Db db, CancellationToken ct) =>
        {
            var row = await db.SingleOrDefaultAsync<(string Request, string Result, int? DurationMs, DateTime CreatedAt, string? Adjustments)>(
                """
                select request::text, result::text, duration_ms, created_at, adjustments::text from app.valuations
                where id = @id and (seat_id = @seatId or account_id = @accountId or admin_id = @adminId)
                """,
                new { id, seatId = http.User.SeatId(), accountId = http.User.AccountId(), adminId = http.User.AdminId() }, ct);
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
                where v.seat_id = @seatId or v.admin_id = @adminId
                order by v.created_at desc limit @limit
                """, new { seatId = http.User.SeatId(), adminId = http.User.AdminId(), limit = Math.Clamp(limit ?? 20, 1, 100) }, ct)))
         .WithSummary("تسعيراتي: آخر تسعيرات المقعد الحالي");
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
