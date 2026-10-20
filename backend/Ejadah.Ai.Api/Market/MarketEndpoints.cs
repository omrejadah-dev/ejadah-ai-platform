using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Estimates;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Market;

public sealed record CityDto(int Id, string Name, string Region);
public sealed record DistrictDto(int Id, string Name, long NMarketDeals);
public sealed record MetaDto(DateTime DataAsOf, long MarketDeals, long AllDeals);

public static class MarketEndpoints
{
    public static void MapMarketEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").WithTags("Market").RequireAuthorization("authenticated");

        g.MapGet("/meta", async (Db db, CancellationToken ct) =>
            Results.Ok(await db.SingleOrDefaultAsync<MetaDto>(
                "select data_as_of, market_deals, all_deals from market.v_meta", ct: ct)))
         .WithSummary("تاريخ آخر صفقة وحجم البيانات");

        g.MapGet("/cities", async (Db db, CancellationToken ct) =>
            Results.Ok(await db.QueryAsync<CityDto>(
                "select id, name, region from market.cities where enabled order by name", ct: ct)))
         .WithSummary("المدن المفعّلة في الواجهة");

        g.MapGet("/cities/{cityId:int}/districts", async (int cityId, string? q, int? limit, Db db, CancellationToken ct) =>
        {
            var enabled = await db.ScalarAsync<bool?>("select enabled from market.cities where id = @cityId", new { cityId }, ct);
            if (enabled is null) return Results.NotFound();
            if (enabled is false) return Results.Problem("المدينة غير مفعّلة حالياً", statusCode: 403);
            var rows = await db.QueryAsync<DistrictDto>(
                "select id, name, n_market_deals from market.search_districts(@cityId, @q, @limit)",
                new { cityId, q = string.IsNullOrWhiteSpace(q) ? null : q.Trim(), limit = Math.Clamp(limit ?? 20, 1, 100) }, ct);
            return Results.Ok(rows);
        }).WithSummary("بحث الأحياء الموحّدة داخل مدينة");

        g.MapGet("/districts/{districtId:int}/history", async (int districtId, string type, Db db, CancellationToken ct) =>
        {
            if (!EstimateRequest.TypeGroups.Contains(type)) return Results.BadRequest("type must be land|villa|apartment|building");
            var rows = await db.QueryAsync<(int Year, decimal PpmMedian, long NDeals)>(
                "select year, round(ppm_median::numeric) as ppm_median, n_deals from market.mv_district_year where district_id = @districtId and type_group = @type order by year",
                new { districtId, type }, ct);
            return Results.Ok(rows.Select(r => new { r.Year, r.PpmMedian, r.NDeals }));
        }).RequireAuthorization(Capabilities.MarketHistory).WithSummary("منحنى سعر المتر السنوي لحي ونوع (مستثمر/مطوّر)");
    }
}
