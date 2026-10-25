namespace Ejadah.Ai.Api.Ai;

/// <summary>The notes reader behind its own AiGuard (calls in flight capped, breaker after repeated failures).</summary>
public sealed class ResilientNotesAssessor(INotesAssessor inner, AiGuard guard) : INotesAssessor
{
    public string Provider => inner.Provider;

    public Task<NotesAssessment> AssessAsync(NotesInput input, CancellationToken ct) =>
        guard.RunAsync(token => inner.AssessAsync(input, token), ct);
}
