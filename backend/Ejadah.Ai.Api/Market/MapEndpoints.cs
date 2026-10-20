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

        // Regions → cities that have at least 3 district polygons (the map works for any of them)
        g.MapGet("/map/cities", async (Db db, IMemoryCache cache, CancellationToken ct) =>
        {
            var json = await cache.GetOrCreateAsync("map:cities:v1", async e =>
            {
                e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(6);
                return await db.ScalarAsync<string>(
                    """
                    with c as (
                      select c.id, c.name, c.region, count(s.district_id) as districts,
                             (select coalesce(sum(m.n_deals),0) from market.mv_city_month m where m.city_id = c.id) as deals
                      from market.cities c join market.districts d on d.city_id = c.id join market.district_shapes s on s.district_id = d.id
                      group by c.id
                      having count(s.district_id) >= 3
                    )
                    select jsonb_agg(jsonb_build_object('region', region, 'deals', rdeals,
                             'cities', cities) order by rdeals desc)::text
                    from (select region, sum(deals) as rdeals,
                                 jsonb_agg(jsonb_build_object('id', id, 'name', name, 'districts', districts, 'deals', deals) order by deals desc) as cities
                          from c group by region) r
                    """, ct: ct);
            });
            return Results.Content(json ?? "[]", "application/json");
        }).WithSummary("المناطق ومدنها التي لها خريطة أحياء");

        // Kingdom view: the 13 regions as polygons, with recent and per-year median price and activity, and one cross-year colour scale
        g.MapGet("/map/overview", async (string? type, Db db, IMemoryCache cache, CancellationToken ct) =>
        {
            type ??= "land";
            if (!EstimateRequest.TypeGroups.Contains(type)) return Results.BadRequest("type must be land|villa|apartment|building");
            var json = await cache.GetOrCreateAsync($"map:overview:v3:{type}", async e =>
            {
                e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(6);
                return await db.ScalarAsync<string>(
                    """
                    with asof as (select data_as_of d from market.v_meta),
                    recent as (
                      select x.region, percentile_cont(0.5) within group (order by x.ppm) ppm,
                             count(*) filter (where x.deal_date > (select d from asof) - interval '12 months') n12
                      from market.deals x
                      where x.is_market_deal and x.type_group = @type and x.deal_date > (select d from asof) - interval '24 months'
                      group by x.region
                    ),
                    yr as (
                      select region, year y, n_deals n, ppm_median ppm from market.mv_region_year where type_group = @type
                    ),
                    yearly as (
                      select region, jsonb_object_agg(y::text, jsonb_build_array(case when n >= 10 then round(ppm::numeric) end, n)) y
                      from yr group by region
                    ),
                    best_city as (   -- the busiest mapped city of each region: where a click on the region lands
                      select distinct on (c.region) c.region, c.id
                      from market.cities c join market.districts d on d.city_id = c.id join market.district_shapes s on s.district_id = d.id
                      left join market.mv_city_month m on m.city_id = c.id
                      group by c.region, c.id order by c.region, coalesce(sum(m.n_deals), 0) desc
                    ),
                    scale as (
                      select (select array_agg(round(v::numeric)) from unnest(percentile_cont(array[1/6.0, 2/6.0, 3/6.0, 4/6.0, 5/6.0]) within group (order by ppm)) v) ppm,
                             (select array_agg(round(v::numeric)) from unnest(percentile_cont(array[1/6.0, 2/6.0, 3/6.0, 4/6.0, 5/6.0]) within group (order by n)) v) cnt
                      from yr where n >= 10
                    )
                    select jsonb_build_object(
                      'type', 'FeatureCollection',
                      'scale', (select jsonb_build_object('ppm', ppm, 'count', cnt) from scale),
                      'features', coalesce(jsonb_agg(jsonb_build_object(
                        'type', 'Feature', 'geometry', r.geometry,
                        'properties', jsonb_build_object('region', r.region, 'name', r.display_name,
                          'center', jsonb_build_array(r.center_lat, r.center_lng), 'cityId', bc.id,
                          'ppm', round(rc.ppm::numeric), 'n12', coalesce(rc.n12, 0), 'y', coalesce(yl.y, '{}'::jsonb)))), '[]'::jsonb))::text
                    from market.region_shapes r
                    left join recent rc on rc.region = r.region
                    left join yearly yl on yl.region = r.region
                    left join best_city bc on bc.region = r.region
                    """, new { type }, ct);
            });
            return Results.Content(json ?? """{"type":"FeatureCollection","features":[]}""", "application/json");
        }).WithSummary("المملكة: حدود المناطق الـ13 بسعر المتر وعدد الصفقات، حديثاً ولكل سنة");

        // GeoJSON FeatureCollection: every district of the city that has a polygon, with stats for one property type.
        g.MapGet("/cities/{cityId:int}/map", async (int cityId, string? type, Db db, IMemoryCache cache, CancellationToken ct) =>
        {
            type ??= "land";
            if (!EstimateRequest.TypeGroups.Contains(type)) return Results.BadRequest("type must be land|villa|apartment|building");
            var json = await cache.GetOrCreateAsync($"map:v2:{cityId}:{type}", async e =>
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
                    ),
                    yearly as (   -- {"2010":[ppm, n], ...}; ppm only when the year has >= 3 deals
                      select district_id,
                             jsonb_object_agg(year::text, jsonb_build_array(case when n_deals >= 3 then round(ppm_median::numeric) end, n_deals)) as y
                      from market.mv_district_year where city_id = @cityId and type_group = @type group by district_id
                    ),
                    scale as (    -- one colour scale for every year so colours compare across time
                      select (select array_agg(round(v::numeric)) from unnest(percentile_cont(array[1/6.0, 2/6.0, 3/6.0, 4/6.0, 5/6.0]) within group (order by ppm_median)) v) as ppm,
                             (select array_agg(round(v::numeric)) from unnest(percentile_cont(array[1/6.0, 2/6.0, 3/6.0, 4/6.0, 5/6.0]) within group (order by n_deals)) v) as cnt,
                             min(year) as y0, max(year) as y1
                      from market.mv_district_year y
                      where y.city_id = @cityId and y.type_group = @type and y.n_deals >= 3
                        and y.district_id in (select district_id from market.district_shapes)
                    )
                    select jsonb_build_object(
                      'type', 'FeatureCollection',
                      'scale', (select jsonb_build_object('ppm', ppm, 'count', cnt, 'firstYear', y0, 'lastYear', y1) from scale),
                      'features', coalesce(jsonb_agg(jsonb_build_object(
                         'type', 'Feature',
                         'geometry', s.geometry,
                         'properties', jsonb_build_object(
                            'id', d.id, 'name', d.name,
                            'center', jsonb_build_array(s.center_lat, s.center_lng),
                            'ppm', round(st.ppm_median::numeric),
                            'n12', coalesce(st.n_12m, 0), 'n24', coalesce(st.n_24m, 0),
                            'nAll', coalesce(t.n_all, 0),
                            'y', coalesce(yr.y, '{}'::jsonb)))), '[]'::jsonb))::text
                    from market.district_shapes s
                    join market.districts d on d.id = s.district_id and d.city_id = @cityId
                    left join stats st on st.district_id = d.id
                    left join totals t on t.district_id = d.id
                    left join yearly yr on yr.district_id = d.id
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
