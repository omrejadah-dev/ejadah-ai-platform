namespace Ejadah.Ai.Api.Ai;

/// <summary>Raised instead of calling the model when the guard refuses: too many calls in flight, or the breaker is open.
/// The pricing endpoint treats it like any AI failure: the price is returned without the AI line.</summary>
public sealed class AiUnavailableException(string reason) : Exception(reason);

/// <summary>Wraps the notes reader with two guards (docs/system-design.md section 4):
///  - at most N calls in flight; a request that cannot get a slot within a few seconds skips the AI step;
///  - after K consecutive failures the breaker opens for a while and calls are skipped at once, so a provider outage
///    does not add 20 s of waiting to every price.</summary>
public sealed class ResilientNotesAssessor(INotesAssessor inner, int maxConcurrent, TimeSpan queueWait, int breakAfter, TimeSpan breakFor)
    : INotesAssessor
{
    private readonly SemaphoreSlim _slots = new(maxConcurrent, maxConcurrent);
    private readonly object _lock = new();
    private int _consecutiveFailures;
    private DateTimeOffset _openUntil = DateTimeOffset.MinValue;

    public string Provider => inner.Provider;

    public async Task<NotesAssessment> AssessAsync(NotesInput input, CancellationToken ct)
    {
        lock (_lock)
            if (DateTimeOffset.UtcNow < _openUntil) throw new AiUnavailableException("circuit_open");

        if (!await _slots.WaitAsync(queueWait, ct)) throw new AiUnavailableException("busy");
        try
        {
            var result = await inner.AssessAsync(input, ct);
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
