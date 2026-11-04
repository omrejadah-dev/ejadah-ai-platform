using System.Collections.Frozen;

namespace Ejadah.Ai.Api.Estimates;

/// <summary>The property form (spec 5.2). Field applicability depends on PropertyType; validation mirrors the table.</summary>
public sealed class EstimateRequest
{
    public static readonly FrozenSet<string> TypeGroups = new[] { "land", "villa", "apartment", "building" }.ToFrozenSet();
    public static readonly FrozenSet<string> AllowedFeatures = new[] { "elevator", "garden", "pool", "annex", "covered_parking", "central_ac" }.ToFrozenSet();
    public const int MaxNotes = 1000, MaxCode = 40;

    public string PropertyType { get; set; } = "";
    public int CityId { get; set; }
    public int DistrictId { get; set; }
    public string? PlanNo { get; set; }
    public string? PlotNo { get; set; }
    public decimal AreaM2 { get; set; }
    public int? AgeYears { get; set; }
    public int? Floors { get; set; }
    public int? Units { get; set; }
    public decimal? AnnualIncome { get; set; }
    public List<string> Features { get; set; } = [];
    public string? Notes { get; set; }

    /// <summary>Field (camelCase, as the form names it) → Arabic messages. Empty when the form is valid.
    /// Minimal APIs do not run data annotations here, so every limit lives in this method.</summary>
    public Dictionary<string, string[]> Validate()
    {
        Features ??= [];   // "features": null in the JSON
        var errors = new Dictionary<string, List<string>>();
        void Add(string field, string message) { if (!errors.TryGetValue(field, out var l)) errors[field] = l = []; l.Add(message); }

        if (!TypeGroups.Contains(PropertyType)) Add("propertyType", "اختر نوع العقار: أرض أو فيلا أو شقة أو عمارة");
        var (min, max) = PropertyType switch
        {
            "land" => (50m, 1_000_000m),
            "apartment" => (30m, 2_000m),
            "villa" or "building" => (100m, 20_000m),
            _ => (1m, 1_000_000m),
        };
        if (AreaM2 < min || AreaM2 > max) Add("areaM2", $"المساحة بين {min:0} و{max:0} م²");

        if (PropertyType == "land")
        {
            const string notForLand = "لا ينطبق على الأرض";
            if (AgeYears is not null) Add("ageYears", notForLand);
            if (Floors is not null) Add("floors", notForLand);
            if (Units is not null) Add("units", notForLand);
            if (AnnualIncome is not null) Add("annualIncome", notForLand);
            if (Features.Count > 0) Add("features", notForLand);
        }
        else
        {
            if (Floors is not null && PropertyType is not ("villa" or "building")) Add("floors", "عدد الأدوار للفيلا والعمارة فقط");
            if (Units is not null && PropertyType != "building") Add("units", "عدد الوحدات للعمارة فقط");
        }
        if (AgeYears is < 0 or > 60) Add("ageYears", "عمر العقار بين 0 و60 سنة");
        if (Floors is < 1 or > 30) Add("floors", "عدد الأدوار بين 1 و30");
        if (Units is < 1 or > 500) Add("units", "عدد الوحدات بين 1 و500");
        if (AnnualIncome is < 0) Add("annualIncome", "الدخل السنوي لا يكون سالباً");
        foreach (var f in Features) if (!AllowedFeatures.Contains(f)) Add("features", $"ميزة غير معروفة: {f}");
        if (PlanNo?.Length > MaxCode) Add("planNo", $"رقم المخطط حتى {MaxCode} حرفاً");
        if (PlotNo?.Length > MaxCode) Add("plotNo", $"رقم القطعة حتى {MaxCode} حرفاً");
        if (Notes?.Length > MaxNotes) Add("notes", $"المعلومات الإضافية حتى {MaxNotes} حرف");

        return errors.ToDictionary(e => e.Key, e => e.Value.ToArray());
    }
}
