using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Ai;

/// <summary>Raised instead of calling the model when the guard refuses: too many calls in flight, or the breaker is open.
/// Callers treat it like any AI failure (the price comes without the AI line; the legal answer falls back to the sources).</summary>
public sealed class AiUnavailableException(string reason) : Exception(reason);

/// <summary>One guard per AI feature (docs/system-design.md section 4):
///  - at most N calls in flight; a call that cannot get a slot within a few seconds is skipped;
///  - after K consecutive failures the breaker opens for a while and calls are skipped at once, so a provider outage
///    does not add the full timeout to every request.</summary>
public sealed class AiGuard(int maxConcurrent, TimeSpan queueWait, int breakAfter, TimeSpan breakFor)
{
    private readonly SemaphoreSlim _slots = new(maxConcurrent, maxConcurrent);
    private readonly object _lock = new();
    private int _consecutiveFailures;
    private DateTimeOffset _openUntil = DateTimeOffset.MinValue;

    public static AiGuard FromConfig(IConfiguration config)
    {
        var ai = config.GetSection("Ai");
        return new AiGuard(ai.GetValue("MaxConcurrent", 8), TimeSpan.FromSeconds(ai.GetValue("QueueWaitSeconds", 5)),
                           ai.GetValue("BreakAfterFailures", 5), TimeSpan.FromSeconds(ai.GetValue("BreakSeconds", 60)));
    }

    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> call, CancellationToken ct)
    {
        lock (_lock)
            if (DateTimeOffset.UtcNow < _openUntil) throw new AiUnavailableException("circuit_open");

        if (!await _slots.WaitAsync(queueWait, ct)) throw new AiUnavailableException("busy");
        try
        {
            var result = await call(ct);
            lock (_lock) _consecutiveFailures = 0;
            return result;
        }
        catch (Exception)   // timeouts count too: a slow provider is as bad as a failing one
        {
            lock (_lock)
                if (++_consecutiveFailures >= breakAfter) { _openUntil = DateTimeOffset.UtcNow + breakFor; _consecutiveFailures = 0; }
            throw;
        }
        finally { _slots.Release(); }
    }
}

/// <summary>One row of ops.ai_calls (migration 013).</summary>
public sealed record AiCallLog(string Feature, string Provider, string? Model, bool Ok, int DurationMs, int? InputTokens, int? OutputTokens,
                               string? Error, string? Output)
{
    public Guid? SeatId { get; init; }
    public Guid? ValuationId { get; init; }

    public Task SaveAsync(Db db, CancellationToken ct) => db.ExecuteAsync(
        """
        insert into ops.ai_calls (feature, provider, model, seat_id, valuation_id, ok, duration_ms, input_tokens, output_tokens, error, output)
        values (@Feature, @Provider, @Model, @SeatId, @ValuationId, @Ok, @DurationMs, @InputTokens, @OutputTokens, @Error, @Output::jsonb)
        """, this, ct);
}
