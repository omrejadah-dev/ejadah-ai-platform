using System.Data;
using Dapper;
using Npgsql;

namespace Ejadah.Ai.Api.Infrastructure;

/// <summary>The four Dapper calls, on the pool (<see cref="Db"/>) or inside one transaction (<see cref="DbTx"/>),
/// so helpers such as <see cref="Audit"/> can join whichever the caller is using.</summary>
public interface ISql
{
    Task<T?> ScalarAsync<T>(string sql, object? args = null, CancellationToken ct = default);
    Task<IReadOnlyList<T>> QueryAsync<T>(string sql, object? args = null, CancellationToken ct = default);
    Task<T?> SingleOrDefaultAsync<T>(string sql, object? args = null, CancellationToken ct = default);
    Task<int> ExecuteAsync(string sql, object? args = null, CancellationToken ct = default);
}

/// <summary>Thin Dapper wrapper over a pooled NpgsqlDataSource. The market schema is read with plain SQL only.</summary>
public sealed class Db(NpgsqlDataSource dataSource) : ISql
{
    public async Task<T?> ScalarAsync<T>(string sql, object? args = null, CancellationToken ct = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        return await conn.ExecuteScalarAsync<T>(new CommandDefinition(sql, args, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<T>> QueryAsync<T>(string sql, object? args = null, CancellationToken ct = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        return (await conn.QueryAsync<T>(new CommandDefinition(sql, args, cancellationToken: ct))).AsList();
    }

    public async Task<T?> SingleOrDefaultAsync<T>(string sql, object? args = null, CancellationToken ct = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<T>(new CommandDefinition(sql, args, cancellationToken: ct));
    }

    public async Task<int> ExecuteAsync(string sql, object? args = null, CancellationToken ct = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition(sql, args, cancellationToken: ct));
    }

    /// <summary>Runs <paramref name="work"/> on one connection in one transaction (read committed) and commits when it returns.
    /// An exception rolls everything back. Return early before writing anything to make a refusal leave no trace.</summary>
    public async Task<T> InTransactionAsync<T>(Func<DbTx, Task<T>> work, CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        var result = await work(new DbTx(conn, tx));
        await tx.CommitAsync(ct);
        return result;   // disposing an uncommitted transaction rolls it back
    }
}

/// <summary>The same calls bound to one open transaction (see <see cref="Db.InTransactionAsync"/>).</summary>
public sealed class DbTx(NpgsqlConnection conn, NpgsqlTransaction tx) : ISql
{
    public Task<T?> ScalarAsync<T>(string sql, object? args = null, CancellationToken ct = default) =>
        conn.ExecuteScalarAsync<T>(new CommandDefinition(sql, args, tx, cancellationToken: ct));

    public async Task<IReadOnlyList<T>> QueryAsync<T>(string sql, object? args = null, CancellationToken ct = default) =>
        (await conn.QueryAsync<T>(new CommandDefinition(sql, args, tx, cancellationToken: ct))).AsList();

    public Task<T?> SingleOrDefaultAsync<T>(string sql, object? args = null, CancellationToken ct = default) =>
        conn.QuerySingleOrDefaultAsync<T>(new CommandDefinition(sql, args, tx, cancellationToken: ct));

    public Task<int> ExecuteAsync(string sql, object? args = null, CancellationToken ct = default) =>
        conn.ExecuteAsync(new CommandDefinition(sql, args, tx, cancellationToken: ct));
}

public static class DbRegistration
{
    public static IServiceCollection AddEjadahDatabase(this IServiceCollection services, IConfiguration config)
    {
        var cs = config.GetConnectionString("Default")
                 ?? Environment.GetEnvironmentVariable("DATABASE_URL")
                 ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured");
        if (cs.StartsWith("postgres", StringComparison.OrdinalIgnoreCase)) cs = UrlToConnectionString(cs);

        DefaultTypeMap.MatchNamesWithUnderscores = true;
        var ds = new NpgsqlDataSourceBuilder(cs).EnableDynamicJson().Build();
        services.AddSingleton(ds);
        services.AddSingleton<Db>();
        return services;
    }

    // postgresql://user:pass@host:port/db  →  Host=...;Port=...;Username=...;Password=...;Database=...
    private static string UrlToConnectionString(string url)
    {
        var u = new Uri(url);
        var userInfo = u.UserInfo.Split(':', 2);
        return new NpgsqlConnectionStringBuilder
        {
            Host = u.Host, Port = u.Port > 0 ? u.Port : 5432,
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
            Database = u.AbsolutePath.Trim('/'),
            Pooling = true, MaxPoolSize = 32,
        }.ConnectionString;
    }
}
