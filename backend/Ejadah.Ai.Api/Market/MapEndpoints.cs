using System.Collections.Frozen;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Estimates;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Market;

/// <summary>District choropleth map + district summary panel (home page).
/// Recent figures come from market.mv_district_recent / mv_region_recent, the mapped-city rule from market.v_mapped_cities
/// and the colour classes from market.sextiles (all migration 019).</summary>
public static class MapEndpoints
{
    /// <summary>The four types, plus "all" for the four together.</summary>
    static readonly FrozenSet<string> MapTypes = EstimateRequest.TypeGroups.Append("all").ToFrozenSet();
    const string TypeMessage = "النوع: أرض أو فيلا أو شقة أو عمارة أو الكل";

    // cache keys (MarketCache adds the data date); bump the version when a response shape changes
    const string CitiesKey = "map:cities:v2", OverviewKey = "map:overview:v5", CityKey = "map:city:v4", SummaryKey = "map:summary:v1";

    // cities with a district map (v_mapped_cities), with their deal count: the city list, and where a click on a region lands
    const string MappedCte = """
        mapped as (
          select mc.city_id as id, mc.name, mc.region, mc.districts,
                 (select coalesce(sum(m.n_deals), 0) from market.mv_city_month m where m.city_id = mc.city_id) as deals
          from market.v_mapped_cities mc)
        """;

    public static void MapMapEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").WithTags("Map").RequireAuthorization(Capabilities.PriceEstimate);

        // Regions → cities that have at least 3 district polygons (the map works for any of them)
        g.MapGet("/map/cities", async (Db db, MarketCache cache, CancellationToken ct) =>
        {
            var json = await cache.JsonAsync(CitiesKey, () => db.ScalarAsync<string>(
                $"""
                with {MappedCte}
                select jsonb_agg(jsonb_build_object('region', region, 'deals', rdeals,
                         'cities', cities) order by rdeals desc)::text
                from (select region, sum(deals) as rdeals,
                             jsonb_agg(jsonb_build_object('id', id, 'name', name, 'districts', districts, 'deals', deals) order by deals desc) as cities
                      from mapped group by region) r
                """, ct: ct), ct);
            return Results.Content(json ?? "[]", "application/json");
        }).WithSummary("المناطق ومدنها التي لها خريطة أحياء");

        // Kingdom view: the 13 regions as polygons, with recent and per-year median price and activity, and one cross-year colour scale
        g.MapGet("/map/overview", async (string? type, Db db, MarketCache cache, CancellationToken ct) =>
        {
            type ??= "land";
            if (!MapTypes.Contains(type)) return Problems.Invalid("type", TypeMessage);
            var json = await cache.JsonAsync($"{OverviewKey}:{type}", () => db.ScalarAsync<string>(
                $$"""
                with recent as (
                  select region, ppm_median as ppm, n_12m as n12 from market.mv_region_recent where type_group = @type
                ),
                yr as (
                  select region, year y, n_deals n, ppm_median ppm from market.v_region_year where type_group = @type
                ),
                yearly as (
                  select region, jsonb_object_agg(y::text, jsonb_build_array(case when n >= 10 then round(ppm::numeric) end, n)) y
                  from yr group by region
                ),
                {{MappedCte}},
                best_city as (   -- the busiest mapped city of each region: where a click on the region lands
                  select distinct on (region) region, id from mapped order by region, deals desc
                ),
                scale as (
                  select market.sextiles(array_agg(ppm)) ppm, market.sextiles(array_agg(n::float8)) cnt from yr where n >= 10
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
                """, new { type }, ct), ct);
            return Results.Content(json ?? """{"type":"FeatureCollection","features":[]}""", "application/json");
        }).WithSummary("المملكة: حدود المناطق الـ13 بسعر المتر وعدد الصفقات، حديثاً ولكل سنة");

        // GeoJSON FeatureCollection: every district of the city that has a polygon, with stats for one property type.
        g.MapGet("/cities/{cityId:int}/map", async (int cityId, string? type, Db db, MarketCache cache, CancellationToken ct) =>
        {
            type ??= "land";
            if (!MapTypes.Contains(type)) return Problems.Invalid("type", TypeMessage);
            var json = await cache.JsonAsync($"{CityKey}:{cityId}:{type}", () => db.ScalarAsync<string>(
                """
                with stats as (
                  select district_id, n_12m, n_24m, ppm_median from market.mv_district_recent where city_id = @cityId and type_group = @type
                ),
                totals as (
                  select district_id, sum(n_deals) as n_all from market.mv_district_month where city_id = @cityId group by district_id
                ),
                yearly as (   -- {"2010":[ppm, n], ...}; ppm only when the year has >= 3 deals
                  select district_id,
                         jsonb_object_agg(year::text, jsonb_build_array(case when n_deals >= 3 then round(ppm_median::numeric) end, n_deals)) as y
                  from market.v_district_year where city_id = @cityId and type_group = @type group by district_id
                ),
                scale as (    -- one colour scale for every year so colours compare across time
                  select market.sextiles(array_agg(ppm_median)) as ppm, market.sextiles(array_agg(n_deals::float8)) as cnt,
                         min(year) as y0, max(year) as y1
                  from market.v_district_year y
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
                """, new { cityId, type }, ct), ct);
            return Results.Content(json ?? """{"type":"FeatureCollection","features":[]}""", "application/json");
        }).WithSummary("خريطة أحياء المدينة مع وسيط سعر المتر وعدد الصفقات لنوع عقار");

        // Side panel: one district, all four types (and all together), trend for the chosen type, latest deals.
        g.MapGet("/districts/{districtId:int}/summary", async (int districtId, string? type, Db db, MarketCache cache, CancellationToken ct) =>
        {
            type ??= "land";
            if (!MapTypes.Contains(type)) return Problems.Invalid("type", TypeMessage);
            var json = await cache.JsonAsync($"{SummaryKey}:{districtId}:{type}", () => db.ScalarAsync<string>(
                """
                select jsonb_build_object(
                  'id', d.id, 'name', d.name, 'cityId', d.city_id, 'city', c.name, 'dataAsOf', (select data_as_of from market.v_meta),
                  'types', (select jsonb_agg(jsonb_build_object('type', t.tg, 'n12', coalesce(r.n_12m, 0), 'ppm', round(r.ppm_median::numeric)) order by t.ord)
                            from (values ('all',0),('land',1),('villa',2),('apartment',3),('building',4)) t(tg, ord)
                            left join market.mv_district_recent r on r.city_id = d.city_id and r.district_id = d.id and r.type_group = t.tg),
                  'trend', coalesce((select jsonb_agg(jsonb_build_object('year', year, 'ppm_median', round(ppm_median::numeric), 'n_deals', n_deals) order by year)
                            from market.v_district_year where city_id = d.city_id and district_id = d.id and type_group = @type), '[]'::jsonb),
                  -- "all" = the four types (market deals always have one): the newest 10 of each type's newest 10 reads
                  -- 40 index entries instead of sorting every deal of a busy district (~80k rows, ~200 ms)
                  'latest', coalesce((select jsonb_agg(q order by q->>'date' desc) from (
                            select jsonb_build_object('date', x.deal_date, 'type', x.type_group, 'plan', x.plan_raw, 'plot', x.plot_raw,
                                                      'area', x.area_m2, 'ppm', round(x.ppm), 'price', x.price) q
                            from unnest(case when @type = 'all' then array['land','villa','apartment','building'] else array[@type::text] end) tg(t)
                            cross join lateral (
                              select * from market.deals x
                              where x.is_market_deal and x.city_id = d.city_id and x.district_id = d.id and x.type_group = tg.t
                              order by x.deal_date desc limit 10) x
                            order by x.deal_date desc limit 10) l), '[]'::jsonb)
                )::text
                from market.districts d join market.cities c on c.id = d.city_id
                where d.id = @districtId
                """, new { districtId, type }, ct), ct);
            return json is null ? Results.NotFound() : Results.Content(json, "application/json");
        }).WithSummary("ملخص حي: الأسعار لكل نوع، الاتجاه، وآخر الصفقات");
    }
}
