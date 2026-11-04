using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Estimates;

/// <summary>One row of app.adjustment_rules (migration 012). Percentages are set by Ejadah from the admin panel.</summary>
public sealed record AdjustmentRule(int Id, string TypeGroup, string Factor, string LabelAr, string Kind, decimal Pct,
                                    decimal? MaxAbsPct, bool Enabled, DateTime UpdatedAt);

public sealed record PricingSetting(string Key, decimal Value, string LabelAr, DateTime UpdatedAt);

/// <summary>The two caps (percent): total of the rule lines, and the AI reading of the notes. Admin-set in app.pricing_settings.</summary>
public sealed record PricingCaps(decimal RulesMaxTotalPct, decimal AiMaxPct)
{
    public const string RulesKey = "rules_max_total_pct", AiKey = "ai_max_pct";
    public static readonly PricingCaps Default = new(30, 15);
}

/// <summary>One line of the explanation under the price, e.g. "عمر العقار −6%".</summary>
public sealed record AdjustmentItem(string Factor, string Label, decimal Pct);

/// <summary>The breakdown shown under the single price: market price, adjustments, final price.</summary>
public sealed record PricingBreakdown(
    decimal MarketPpm, decimal MarketTotal,
    IReadOnlyList<AdjustmentItem> Items, decimal RulesPct, bool RulesCapped,
    decimal? AiPct, string? AiReason,
    decimal FinalPpm, decimal FinalTotal)
{
    /// <summary>What the AI found in the notes (labels with up/down), and whether it was the trial reader or Claude.</summary>
    public IReadOnlyList<Ai.NotesItem>? AiItems { get; init; }
    public string? AiProvider { get; init; }
}

public static class Adjustments
{
    public const string Cols = "id, type_group, factor, label_ar, kind, pct, max_abs_pct, enabled, updated_at";

    public static Task<IReadOnlyList<AdjustmentRule>> RulesAsync(Db db, string typeGroup, CancellationToken ct) =>
        db.QueryAsync<AdjustmentRule>("select " + Cols + " from app.adjustment_rules where type_group = @typeGroup and enabled order by id", new { typeGroup }, ct);

    /// <summary>Both caps from app.pricing_settings in one query; a missing row falls back to the default here.</summary>
    public static async Task<PricingCaps> CapsAsync(Db db, CancellationToken ct)
    {
        var rows = (await db.QueryAsync<(string Key, decimal Value)>(
            "select key, value from app.pricing_settings where key in (@rules, @ai)", new { rules = PricingCaps.RulesKey, ai = PricingCaps.AiKey }, ct))
            .ToDictionary(r => r.Key, r => r.Value);
        return new PricingCaps(rows.GetValueOrDefault(PricingCaps.RulesKey, PricingCaps.Default.RulesMaxTotalPct),
                               rows.GetValueOrDefault(PricingCaps.AiKey, PricingCaps.Default.AiMaxPct));
    }

    /// <summary>The rule lines that apply to this property. Rules at 0% are left out so the explanation stays short.</summary>
    public static List<AdjustmentItem> Evaluate(EstimateRequest req, IEnumerable<AdjustmentRule> rules)
    {
        var items = new List<AdjustmentItem>();
        foreach (var r in rules)
        {
            if (r.Pct == 0) continue;
            decimal? v = r.Kind switch
            {
                "per_year" when r.Factor == "age" && req.AgeYears > 0 => r.Pct * req.AgeYears.Value,
                "per_floor" when r.Factor == "floors" && req.Floors > 1 => r.Pct * (req.Floors.Value - 1),
                "flag" when req.Features.Contains(r.Factor) => r.Pct,
                _ => null,
            };
            if (v is null) continue;
            if (r.MaxAbsPct is { } cap) v = Math.Clamp(v.Value, -cap, cap);
            items.Add(new AdjustmentItem(r.Factor, r.LabelAr, Math.Round(v.Value, 1)));
        }
        return items;
    }

    /// <summary>Applies the rule lines (total capped) and an optional AI percentage to the market estimate.
    /// Returns null when the engine produced no price (insufficient data): nothing to adjust.</summary>
    public static PricingBreakdown? Build(decimal? marketPpm, decimal? marketTotal, List<AdjustmentItem> items, decimal rulesCap,
                                          decimal? aiPct = null, string? aiReason = null)
    {
        if (marketPpm is not > 0 || marketTotal is not > 0) return null;
        var sum = items.Sum(i => i.Pct);
        var rulesPct = Math.Clamp(sum, -rulesCap, rulesCap);
        var factor = (1 + rulesPct / 100m) * (1 + (aiPct ?? 0) / 100m);
        return new PricingBreakdown(
            marketPpm.Value, marketTotal.Value, items, rulesPct, rulesPct != sum, aiPct, aiReason,
            Math.Round(marketPpm.Value * factor / 10m) * 10m,
            Math.Round(marketTotal.Value * factor / 10_000m) * 10_000m);
    }
}
