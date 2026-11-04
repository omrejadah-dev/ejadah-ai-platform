namespace Ejadah.Ai.Api.Auth;

/// <summary>Capability matrix (spec 4.2). Enforced server-side via authorization policies named after the capability.</summary>
public static class Capabilities
{
    public const string PriceEstimate = "price.estimate";
    public const string PriceComparables = "price.comparables";
    public const string TipsGenerate = "tips.generate";
    public const string ReportPrint = "report.print";
    public const string LegalAsk = "legal.ask";
    public const string MarketHistory = "market.history";
    public const string MarketLargeDeals = "market.large_deals";
    public const string SeatsManage = "seats.manage";
    public const string Admin = "admin.*";

    public static readonly string[] All =
        [PriceEstimate, PriceComparables, TipsGenerate, ReportPrint, LegalAsk, MarketHistory, MarketLargeDeals, SeatsManage, Admin];

    private static readonly string[] Subscriber = [PriceEstimate, PriceComparables, TipsGenerate, ReportPrint, LegalAsk];

    public static IReadOnlyList<string> For(string role, bool isOwner) => role switch
    {
        Roles.Broker => Subscriber,
        Roles.Office => isOwner ? [.. Subscriber, SeatsManage] : Subscriber,
        Roles.Investor => [.. Subscriber, MarketHistory],
        Roles.Developer => [.. Subscriber, MarketHistory, MarketLargeDeals],
        Roles.Admin => [SeatsManage, Admin],
        _ => [],
    };
}
