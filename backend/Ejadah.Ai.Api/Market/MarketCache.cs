using Ejadah.Ai.Api.Infrastructure;
using Microsoft.Extensions.Caching.Memory;

namespace Ejadah.Ai.Api.Market;

/// <summary>Cache for market responses that only change on a data reload. Every key carries market.v_meta.data_as_of,
/// so a reload (new last deal date) is served fresh within a minute instead of after the 6 hours.</summary>
public sealed class MarketCache(Db db, IMemoryCache cache)
{
    public static readonly TimeSpan Ttl = TimeSpan.FromHours(6);
    private static readonly TimeSpan AsOfTtl = TimeSpan.FromMinutes(1);   // one v_meta read a minute, not one per call
    private const string AsOfKey = "market:data_as_of";

    public async Task<string> DataAsOfAsync(CancellationToken ct) =>
        (await cache.GetOrCreateAsync(AsOfKey, async e =>
        {
            e.AbsoluteExpirationRelativeToNow = AsOfTtl;
            var asOf = await db.ScalarAsync<DateTime?>("select data_as_of from market.v_meta", ct: ct);
            return asOf?.ToString("yyyy-MM-dd") ?? "none";
        }))!;

    /// <summary>The cached JSON for <paramref name="key"/> at the current data date, loading it when missing.</summary>
    public async Task<string?> JsonAsync(string key, Func<Task<string?>> load, CancellationToken ct)
    {
        var asOf = await DataAsOfAsync(ct);
        return await cache.GetOrCreateAsync($"{key}@{asOf}", async e =>
        {
            e.AbsoluteExpirationRelativeToNow = Ttl;
            return await load();
        });
    }
}
