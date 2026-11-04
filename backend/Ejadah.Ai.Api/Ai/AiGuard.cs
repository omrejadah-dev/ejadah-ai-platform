using System.Diagnostics;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Ai;

/// <summary>Raised instead of calling the model when the guard refuses: too many calls in flight, or the breaker is open.
/// Callers treat it like any AI failure (the price comes without the AI line; the legal answer falls back to the sources).</summary>
public sealed class AiUnavailableException(string reason) : Exception(reason);

/// <summary>One guard per AI feature (docs/system-design.md section 4):
///  - at most N calls in flight; a call that cannot get a slot within a few seconds is skipped;
///  - each call (queue wait included) gets the feature's time limit;
///  - after K consecutive failures the breaker opens for a while and calls are skipped at once, so a provider outage
///    does not add the full timeout to every request.</summary>
public sealed class AiGuard(int maxConcurrent, TimeSpan queueWait, int breakAfter, TimeSpan breakFor, TimeSpan timeout)
{
    private readonly SemaphoreSlim _slots = new(maxConcurrent, maxConcurrent);
    private readonly object _lock = new();
    private int _consecutiveFailures;
    private DateTimeOffset _openUntil = DateTimeOffset.MinValue;

    /// <summary>The Ai settings, with this feature's time limit from Ai:TimeoutSeconds:{feature}.</summary>
    public static AiGuard FromConfig(IConfiguration config, string feature, int defaultTimeoutSeconds)
    {
        var ai = config.GetSection("Ai");
        return new AiGuard(ai.GetValue("MaxConcurrent", 8), TimeSpan.FromSeconds(ai.GetValue("QueueWaitSeconds", 5)),
                           ai.GetValue("BreakAfterFailures", 5), TimeSpan.FromSeconds(ai.GetValue("BreakSeconds", 60)),
                           TimeSpan.FromSeconds(ai.GetValue($"TimeoutSeconds:{feature}", defaultTimeoutSeconds)));
    }

    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> call, CancellationToken ct)
    {
        lock (_lock)
            if (DateTimeOffset.UtcNow < _openUntil) throw new AiUnavailableException("circuit_open");

        // the time limit lives here, not with the caller, so the guard can tell its own timeout from the caller hanging up
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        if (!await _slots.WaitAsync(queueWait, cts.Token)) throw new AiUnavailableException("busy");
        try
        {
            var result = await call(cts.Token);
            lock (_lock) _consecutiveFailures = 0;
            return result;
        }
        // our own timeout counts (a slow provider is as bad as a failing one); a caller who cancels says nothing
        // about the provider, and counting it would open the breaker for everyone
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            lock (_lock)
                if (++_consecutiveFailures >= breakAfter) { _openUntil = DateTimeOffset.UtcNow + breakFor; _consecutiveFailures = 0; }
            throw;
        }
        finally { _slots.Release(); }
    }
}

/// <summary>One row of ops.ai_calls (migration 013). Admins go in AdminId: seat_id references identity.seats.</summary>
public sealed record AiCallLog(string Feature, string Provider, string? Model, bool Ok, int DurationMs, int? InputTokens, int? OutputTokens,
                               string? Error, string? Output)
{
    public Guid? SeatId { get; init; }
    public Guid? AdminId { get; init; }
    public Guid? ValuationId { get; init; }

    public Task SaveAsync(ISql db, CancellationToken ct) => db.ExecuteAsync(
        """
        insert into ops.ai_calls (feature, provider, model, seat_id, admin_id, valuation_id, ok, duration_ms, input_tokens, output_tokens, error, output)
        values (@Feature, @Provider, @Model, @SeatId, @AdminId, @ValuationId, @Ok, @DurationMs, @InputTokens, @OutputTokens, @Error, @Output::jsonb)
        """, this, ct);
}

/// <summary>One AI call made for a request, and its ops.ai_calls row. Any failure (timeout, breaker, provider error) returns
/// no result and a failed row, and the caller carries on without the AI part. Only the caller hanging up throws.</summary>
public static class AiCall
{
    public static async Task<(T? Result, AiCallLog Log)> RunAsync<T>(string feature, string provider, Func<CancellationToken, Task<T>> call,
                                                                     Func<T, int, AiCallLog> logOk, ILogger log, CancellationToken ct)
        where T : class
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var result = await call(ct);   // the AiGuard behind the provider applies the time limit
            return (result, logOk(result, (int)sw.ElapsedMilliseconds));
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "{Feature} failed after {Ms} ms; continuing without it", feature, sw.ElapsedMilliseconds);
            var error = ex is OperationCanceledException ? "timeout" : ex.GetType().Name + ": " + ex.Message;
            return (null, new AiCallLog(feature, provider, null, false, (int)sw.ElapsedMilliseconds, null, null, error, null));
        }
    }
}
