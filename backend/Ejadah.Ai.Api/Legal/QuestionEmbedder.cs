using System.Globalization;
using System.Net.Http.Json;

namespace Ejadah.Ai.Api.Legal;

/// <summary>Turns a question into the BGE-M3 vector that legal.search_meaning (016) compares with the articles.
/// Null means "search by keywords instead": no service configured, or it failed or was slow.</summary>
public interface IQuestionEmbedder
{
    Task<string?> EmbedAsync(string question, CancellationToken ct);
}

/// <summary>Calls the model service (infra/embedder) and returns the vector as a pgvector literal, e.g. "[0.01,-0.2,...]".</summary>
public sealed class HttpQuestionEmbedder(HttpClient http, ILogger<HttpQuestionEmbedder> log) : IQuestionEmbedder
{
    private sealed record EmbedResponse(float[][] Vectors);

    public async Task<string?> EmbedAsync(string question, CancellationToken ct)
    {
        try
        {
            using var res = await http.PostAsJsonAsync("embed", new { texts = new[] { question } }, ct);
            res.EnsureSuccessStatusCode();
            var body = await res.Content.ReadFromJsonAsync<EmbedResponse>(ct);
            var v = body?.Vectors is [var first, ..] ? first : null;
            return v is { Length: 1024 } ? "[" + string.Join(',', v.Select(x => x.ToString("R", CultureInfo.InvariantCulture))) + "]" : null;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "question embedding failed; searching by keywords");
            return null;
        }
    }
}

public sealed class NoQuestionEmbedder : IQuestionEmbedder
{
    public Task<string?> EmbedAsync(string question, CancellationToken ct) => Task.FromResult<string?>(null);
}

public static class QuestionEmbedderRegistration
{
    /// <summary>Embedder:Url (e.g. http://embedder:8000/) switches on search by meaning; unset keeps keyword search.</summary>
    public static IServiceCollection AddEjadahQuestionEmbedder(this IServiceCollection services, IConfiguration config)
    {
        var url = config["Embedder:Url"];
        if (string.IsNullOrWhiteSpace(url))
        {
            services.AddSingleton<IQuestionEmbedder, NoQuestionEmbedder>();
            return services;
        }
        services.AddHttpClient<IQuestionEmbedder, HttpQuestionEmbedder>(c =>
        {
            c.BaseAddress = new Uri(url.EndsWith('/') ? url : url + "/");
            c.Timeout = TimeSpan.FromSeconds(config.GetValue("Embedder:TimeoutSeconds", 5));
        });
        return services;
    }
}
