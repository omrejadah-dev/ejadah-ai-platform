using System.Text.Json;
using Ejadah.Ai.Api.Ai;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Estimates;

/// <summary>«نصائح لك» for a saved valuation (spec 5.4, 8). The first call writes them and saves them in app.valuations.tips;
/// later calls (the saved estimate reopened from «تسعيراتي») return the saved ones at no cost. `regenerate` writes them
/// again once per valuation. A failed write never touches the price: the screen shows a retry.</summary>
public static class Tips
{
    public const string Disclaimer = "هذه النصائح مولَّدة آلياً من بيانات الصفقات المعلنة ولا تُعدّ تقييماً معتمداً.";

    public sealed record TipsRequest(bool Regenerate = false);
    public sealed record TipsDto(IReadOnlyList<Tip> Tips, string Provider, DateTime GeneratedAt, bool CanRegenerate, string Disclaimer);

    /// <summary>What is kept in app.valuations.tips.</summary>
    private sealed record Saved(IReadOnlyList<Tip> Tips, string Provider, string? Model, DateTime GeneratedAt, bool Regenerated);

    private sealed record Row(string Request, string Result, string? Adjustments, string? Tips, string City, string? District, string TypeGroup,
                              decimal AreaM2, string? PlanNo, string Confidence);

    private static readonly Dictionary<string, string> TypeAr = new() { ["land"] = "أرض", ["villa"] = "فيلا", ["apartment"] = "شقة", ["building"] = "عمارة" };

    public static async Task<IResult> HandleAsync(Guid id, TipsRequest? req, HttpContext http, Db db, ITipsWriter writer, ILoggerFactory logs, CancellationToken ct)
    {
        var who = new { id, seatId = http.User.SeatId(), accountId = http.User.AccountId(), adminId = http.User.AdminId() };
        var row = await db.SingleOrDefaultAsync<Row>(
            """
            select v.request::text, v.result::text, v.adjustments::text, v.tips::text, c.name as city, d.name as district,
                   v.type_group::text, v.area_m2, v.plan_no, v.confidence
            from app.valuations v join market.cities c on c.id = v.city_id left join market.districts d on d.id = v.district_id
            where v.id = @id and (v.seat_id = @seatId or v.account_id = @accountId or v.admin_id = @adminId)
            """, who, ct);
        if (row is null) return Results.NotFound();
        if (row.Confidence == "insufficient")
            return Results.Problem(title: "لا نصائح لتسعير بلا سعر: صفقات الحي غير كافية", statusCode: 409, type: "no_price");

        var saved = row.Tips is null ? null : JsonSerializer.Deserialize<Saved>(row.Tips, EstimateEndpoints.Json);
        var regenerate = req?.Regenerate == true;
        if (saved is not null && (!regenerate || saved.Regenerated)) return Results.Ok(Dto(saved));

        using var result = JsonDocument.Parse(row.Result);
        var pricing = row.Adjustments is null ? null : JsonSerializer.Deserialize<PricingBreakdown>(row.Adjustments, EstimateEndpoints.Json);
        var facts = TipsFacts.Build(TypeAr.GetValueOrDefault(row.TypeGroup, row.TypeGroup), row.City, row.District, row.AreaM2, row.PlanNo,
                                    result.RootElement, pricing);

        // spec 8.5: one automatic retry after 2 s (not when the breaker is open or the guard is full: that would only wait)
        var logger = logs.CreateLogger("Ejadah.Ai");
        (TipsResult? Result, AiCallLog Log) call = default;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            call = await AiCall.RunAsync("tips", writer.Provider, t => writer.WriteAsync(facts, t),
                (r, ms) => new AiCallLog("tips", r.Provider, r.Model, true, ms, r.InputTokens, r.OutputTokens, null,
                                         JsonSerializer.Serialize(new { count = r.Tips.Count }, EstimateEndpoints.Json)), logger, ct);
            await (call.Log with { SeatId = http.User.SeatId(), AdminId = http.User.AdminId(), ValuationId = id }).SaveAsync(db, ct);
            if (call.Result is not null || call.Log.Error is { } e && (e.Contains("circuit_open") || e.Contains("busy"))) break;
            if (attempt == 0) await Task.Delay(2000, ct);
        }
        if (call.Result is null)
            return Results.Problem(title: "تعذّر توليد النصائح حالياً", statusCode: 503, type: "tips_unavailable");

        var fresh = new Saved(call.Result.Tips, call.Result.Provider, call.Result.Model, DateTime.UtcNow, Regenerated: saved is not null);
        // first write only if still empty, regeneration only once: two screens asking at the same moment get the same tips
        var stored = await db.ScalarAsync<string?>(
            """
            update app.valuations set tips = @tips::jsonb
            where id = @id and (case when @regen then tips is not null and coalesce((tips->>'regenerated')::boolean, false) = false else tips is null end)
            returning tips::text
            """, new { id, regen = saved is not null, tips = JsonSerializer.Serialize(fresh, EstimateEndpoints.Json) }, ct)
            ?? await db.ScalarAsync<string?>("select tips::text from app.valuations where id = @id", new { id }, ct);
        return Results.Ok(Dto(JsonSerializer.Deserialize<Saved>(stored!, EstimateEndpoints.Json)!));
    }

    private static TipsDto Dto(Saved s) => new(s.Tips, s.Provider, s.GeneratedAt, CanRegenerate: !s.Regenerated, Disclaimer);
}
