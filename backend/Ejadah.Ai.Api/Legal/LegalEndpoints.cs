using System.Diagnostics;
using System.Text.Json;
using Ejadah.Ai.Api.Ai;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Legal;

/// <summary>"اسأل إجادة القانونية" (PLAN.md phase E): search the official law texts, answer from them only, cite them.</summary>
public static class LegalEndpoints
{
    public const string Disclaimer = "إجابات استرشادية من نصوص الأنظمة، وليست استشارة قانونية.";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public sealed record AskRequest(string Question);
    public sealed record SourceDto(int Id, string Title, string Label, string Chapter, string Text, IReadOnlyList<string> Amendments,
                                   string SourceUrl, int Number, bool Cited);
    public sealed record AskResponse(Guid Id, string Question, string Answer, string Provider, IReadOnlyList<SourceDto> Sources,
                                     string Disclaimer, int DurationMs);
    public sealed record LawDto(int Id, string Title, string Authority, string SourceUrl, int Articles, int Amended);
    public sealed record HistoryDto(Guid Id, DateTime CreatedAt, string Question, string Answer);

    private sealed record Row(int ArticleId, int DocumentId, string Title, string Label, string Chapter, string Text, string Amendments, string SourceUrl, float Rank);

    public static void MapLegalEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/legal").WithTags("Legal").RequireAuthorization(Capabilities.LegalAsk);

        g.MapPost("/ask", async (AskRequest req, HttpContext http, Db db, IQuestionEmbedder embedder, ILegalAnswerer ai, ILoggerFactory logs, CancellationToken ct) =>
        {
            var question = (req.Question ?? "").Trim();
            if (question.Length is < 3 or > 500)
                return Problems.Invalid("question", "اكتب سؤالاً بين 3 و500 حرف");

            // search by meaning (016) when the model service answers, by keywords (015) otherwise
            var sw = Stopwatch.StartNew();
            var vector = await embedder.EmbedAsync(question, ct);
            var search = vector is null ? "keyword" : "meaning";
            var rows = await db.QueryAsync<Row>(
                "select article_id, document_id, title, label, chapter, text, amendments::text as amendments, source_url, rank from "
                + (vector is null ? "legal.search(@question, 6)" : "legal.search_meaning(@question, @vector::vector, 6)"),
                new { question, vector }, ct);
            var sources = rows.Select(r => new LegalSource(r.ArticleId, r.Title, r.Label, r.Chapter, r.Text,
                                                           JsonSerializer.Deserialize<List<string>>(r.Amendments) ?? [], r.SourceUrl)).ToList();

            // the model writes the answer from these articles; if it fails or is slow, the articles themselves are the answer
            var (generated, log) = await AiCall.RunAsync("legal", ai.Provider, t => ai.AnswerAsync(question, sources, t),
                (a, ms) => new AiCallLog("legal", ai.Provider, a.Model, true, ms, a.InputTokens, a.OutputTokens, null, JsonSerializer.Serialize(new { a.Cited }, Json)),
                logs.CreateLogger("Ejadah.Ai"), ct);
            var answer = generated ?? MockLegalAnswerer.Build(sources, "fallback");

            // an admin asking is not a seat: seat_id references identity.seats, the admin goes in admin_id (019)
            var seatId = http.User.SeatId(); var adminId = http.User.AdminId();
            var citedIds = answer.Cited.Select(n => sources[n - 1].Id).ToArray();
            var id = await db.ScalarAsync<Guid>(
                """
                insert into app.legal_questions (seat_id, admin_id, question, answer, cited, provider, duration_ms, search)
                values (@seatId, @adminId, @question, @answer, @cited, @provider, @ms, @search) returning id
                """, new { seatId, adminId, question, answer = answer.Answer, cited = citedIds, provider = answer.Provider, ms = (int)sw.ElapsedMilliseconds, search }, ct);
            await (log with { SeatId = seatId, AdminId = adminId }).SaveAsync(db, ct);

            var dto = sources.Select((s, i) => new SourceDto(s.Id, s.Title, s.Label, s.Chapter, s.Text, s.Amendments, s.SourceUrl,
                                                             i + 1, answer.Cited.Contains(i + 1))).ToList();
            return Results.Ok(new AskResponse(id, question, answer.Answer, answer.Provider, dto, Disclaimer, (int)sw.ElapsedMilliseconds));
        })
        .RequireRateLimiting(RateLimits.Legal)
        .WithSummary("سؤال قانوني: يبحث في نصوص الأنظمة ويجيب منها مع ذكر النظام ورقم المادة");

        g.MapGet("/laws", (Db db, CancellationToken ct) => db.QueryAsync<LawDto>(
            """
            select d.id, d.title, d.authority, d.source_url, count(a.id)::int as articles,
                   count(a.id) filter (where jsonb_array_length(a.amendments) > 0)::int as amended
            from legal.documents d join legal.articles a on a.document_id = d.id
            group by d.id order by count(a.id) desc
            """, null, ct))
         .WithSummary("الأنظمة المحمّلة في المكتبة");

        g.MapGet("/history", (int? limit, HttpContext http, Db db, CancellationToken ct) => db.QueryAsync<HistoryDto>(
            "select id, created_at, question, answer from app.legal_questions where seat_id = @seatId or admin_id = @adminId order by created_at desc limit @limit",
            new { seatId = http.User.SeatId(), adminId = http.User.AdminId(), limit = Math.Clamp(limit ?? 10, 1, 50) }, ct))
         .WithSummary("آخر أسئلتي");
    }
}
