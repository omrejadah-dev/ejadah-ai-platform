using System.ComponentModel.DataAnnotations;

namespace Ejadah.Ai.Api.Estimates;

/// <summary>The property form (spec 5.2). Field applicability depends on PropertyType; validation mirrors the table.</summary>
public sealed class EstimateRequest
{
    public static readonly HashSet<string> TypeGroups = ["land", "villa", "apartment", "building"];
    public static readonly HashSet<string> AllowedFeatures = ["elevator", "garden", "pool", "annex", "covered_parking", "central_ac"];

    [Required] public string PropertyType { get; set; } = "";
    [Required] public int CityId { get; set; }
    [Required] public int DistrictId { get; set; }
    [MaxLength(40)] public string? PlanNo { get; set; }
    [MaxLength(40)] public string? PlotNo { get; set; }
    [Required] public decimal AreaM2 { get; set; }
    public int? AgeYears { get; set; }
    public int? Floors { get; set; }
    public int? Units { get; set; }
    public decimal? AnnualIncome { get; set; }
    public List<string> Features { get; set; } = [];
    [MaxLength(1000)] public string? Notes { get; set; }

    public IReadOnlyList<string> Validate()
    {
        var errors = new List<string>();
        if (!TypeGroups.Contains(PropertyType)) errors.Add("propertyType must be one of land, villa, apartment, building");
        var (min, max) = PropertyType switch
        {
            "land" => (50m, 1_000_000m),
            "apartment" => (30m, 2_000m),
            "villa" or "building" => (100m, 20_000m),
            _ => (1m, 1_000_000m),
        };
        if (AreaM2 < min || AreaM2 > max) errors.Add($"areaM2 must be between {min} and {max} for {PropertyType}");
        if (PropertyType == "land" && (AgeYears is not null || Floors is not null || Units is not null || AnnualIncome is not null || Features.Count > 0))
            errors.Add("land does not take ageYears, floors, units, annualIncome or features");
        if (AgeYears is < 0 or > 60) errors.Add("ageYears must be 0..60");
        if (Floors is < 1 or > 30) errors.Add("floors must be 1..30");
        if (Floors is not null && PropertyType is not ("villa" or "building")) errors.Add("floors applies to villa and building only");
        if (Units is not null && PropertyType != "building") errors.Add("units applies to building only");
        if (Units is < 1 or > 500) errors.Add("units must be 1..500");
        if (AnnualIncome is < 0) errors.Add("annualIncome must be >= 0");
        foreach (var f in Features) if (!AllowedFeatures.Contains(f)) errors.Add($"unknown feature '{f}'");
        return errors;
    }
}
