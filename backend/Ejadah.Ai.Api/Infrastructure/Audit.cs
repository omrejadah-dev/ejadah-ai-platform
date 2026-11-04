using System.Text.Json;

namespace Ejadah.Ai.Api.Infrastructure;

/// <summary>ops.audit_log: who did what. Takes <see cref="ISql"/> so the row commits (or rolls back) with the change it describes.</summary>
public static class Audit
{
    public static Task WriteAsync(ISql db, string? actorKind, Guid? actorId, string action, string? subject, HttpContext http, object? data, CancellationToken ct) =>
        db.ExecuteAsync("insert into ops.audit_log (actor_kind, actor_id, action, subject, data, ip) values (@k, @a, @action, @subject, @data::jsonb, @ip)",
            new { k = actorKind, a = actorId, action, subject, data = data is null ? null : JsonSerializer.Serialize(data), ip = http.Connection.RemoteIpAddress?.ToString() }, ct);
}
