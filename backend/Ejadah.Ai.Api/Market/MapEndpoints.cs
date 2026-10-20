using System.Text.Json;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Estimates;
using Ejadah.Ai.Api.Infrastructure;
using Microsoft.Extensions.Caching.Memory;

namespace Ejadah.Ai.Api.Market;

/// <summary>District choropleth map + district summary panel (home page).</summary>
public static class MapEndpoints
{
    public static void MapMapEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").WithTags("Map").RequireAuthorization(Capabilities.PriceEstimate);

        // GeoJSON FeatureCollection: every district of the city that has a polygon, with stats for one property type.
        g.MapGet("/cities/{cityId:int}/map", async (int cityId, string? type, Db db, IMemoryCache cache, CancellationToken ct) =>
        {
            type ??= "land";
            if (!EstimateRequest.TypeGroups.Contains(type)) return Results.BadRequest("type must be land|villa|apartment|building");
            var json = await cache.GetOrCreateAsync($"map:{cityId}:{type}", async e =>
            {
                e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(6);
                return await db.ScalarAsync<string>(
                    """
                    with asof as (select data_as_of d from market.v_meta),
                    stats as (
                      select x.district_id,
                             count(*) filter (where x.deal_date > (select d from asof) - interval '12 months') as n_12m,
                             count(*) as n_24m,
                             percentile_cont(0.5) within group (order by x.ppm) as ppm_median
                      from market.deals x
                      where x.is_market_deal and x.city_id = @cityId and x.type_group = @type
                        and x.deal_date > (select d from asof) - interval '24 months'
                      group by x.district_id
                    ),
                    totals as (
                      select district_id, sum(n_deals) as n_all from market.mv_district_month where city_id = @cityId group by district_id
                    )
                    select jsonb_build_object(
                      'type', 'FeatureCollection',
                      'features', coalesce(jsonb_agg(jsonb_build_object(
                         'type', 'Feature',
                         'geometry', s.geometry,
                         'properties', jsonb_build_object(
                            'id', d.id, 'name', d.name,
                            'center', jsonb_build_array(s.center_lat, s.center_lng),
                            'ppm', round(st.ppm_median::numeric),
                            'n12', coalesce(st.n_12m, 0), 'n24', coalesce(st.n_24m, 0),
                            'nAll', coalesce(t.n_all, 0)))), '[]'::jsonb))::text
                    from market.district_shapes s
                    join market.districts d on d.id = s.district_id and d.city_id = @cityId
                    left join stats st on st.district_id = d.id
                    left join totals t on t.district_id = d.id
                    """, new { cityId, type }, ct);
            });
            return Results.Content(json ?? """{"type":"FeatureCollection","features":[]}""", "application/json");
        }).WithSummary("خريطة أحياء المدينة مع وسيط سعر المتر وعدد الصفقات لنوع عقار");

        // Side panel: one district, all four types, trend for the chosen type, latest deals.
        g.MapGet("/districts/{districtId:int}/summary", async (int districtId, string? type, Db db, CancellationToken ct) =>
        {
            type ??= "land";
            if (!EstimateRequest.TypeGroups.Contains(type)) return Results.BadRequest("type must be land|villa|apartment|building");
            var json = await db.ScalarAsync<string>(
                """
                with asof as (select data_as_of d from market.v_meta)
                select jsonb_build_object(
                  'id', d.id, 'name', d.name, 'cityId', d.city_id, 'city', c.name, 'dataAsOf', (select d from asof),
                  'types', (select jsonb_agg(jsonb_build_object('type', t.tg,
                              'n12', (select count(*) from market.deals x where x.is_market_deal and x.city_id = d.city_id and x.district_id = d.id and x.type_group = t.tg and x.deal_date > (select d from asof) - interval '12 months'),
                              'ppm', (select round(percentile_cont(0.5) within group (order by x.ppm)::numeric) from market.deals x where x.is_market_deal and x.city_id = d.city_id and x.district_id = d.id and x.type_group = t.tg and x.deal_date > (select d from asof) - interval '24 months'))
                            order by t.ord)
                            from (values ('land',1),('villa',2),('apartment',3),('building',4)) t(tg, ord)),
                  'trend', coalesce((select jsonb_agg(jsonb_build_object('year', year, 'ppm_median', round(ppm_median::numeric), 'n_deals', n_deals) order by year)
                            from market.mv_district_year where district_id = d.id and type_group = @type), '[]'::jsonb),
                  'latest', coalesce((select jsonb_agg(q order by q->>'date' desc) from (
                            select jsonb_build_object('date', x.deal_date, 'type', x.type_group, 'plan', x.plan_raw, 'plot', x.plot_raw,
                                                      'area', x.area_m2, 'ppm', round(x.ppm), 'price', x.price) q
                            from market.deals x where x.is_market_deal and x.city_id = d.city_id and x.district_id = d.id and x.type_group = @type
                            order by x.deal_date desc limit 10) l), '[]'::jsonb)
                )::text
                from market.districts d join market.cities c on c.id = d.city_id
                where d.id = @districtId
                """, new { districtId, type }, ct);
            return json is null ? Results.NotFound() : Results.Content(json, "application/json");
        }).WithSummary("ملخص حي: الأسعار لكل نوع، الاتجاه، وآخر الصفقات");
    }
}
