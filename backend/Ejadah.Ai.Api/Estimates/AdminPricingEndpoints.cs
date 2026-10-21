using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Estimates;

/// <summary>Admin panel: the adjustment percentages (age, floors, features) and the caps. Admin only.</summary>
public static class AdminPricingEndpoints
{
    public sealed record RuleUpdate(decimal Pct, decimal? MaxAbsPct, bool Enabled);
    public sealed record SettingUpdate(decimal Value);

    public static void MapAdminPricingEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin/pricing").WithTags("Admin · Pricing").RequireAuthorization(Capabilities.Admin);

        g.MapGet("/rules", (Db db, CancellationToken ct) =>
            db.QueryAsync<AdjustmentRule>($"select {Adjustments.Cols} from app.adjustment_rules order by type_group, id", null, ct))
         .WithSummary("نسب التعديل حسب النوع: العمر والأدوار والمميزات");

        g.MapPut("/rules/{id:int}", async (int id, RuleUpdate body, HttpContext http, Db db, CancellationToken ct) =>
        {
            if (body.Pct is < -50 or > 50) return Results.ValidationProblem(new Dictionary<string, string[]> { ["pct"] = ["النسبة بين −50 و50"] });
            if (body.MaxAbsPct is < 0 or > 50) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxAbsPct"] = ["الحد بين 0 و50"] });
            var adminId = http.User.PrincipalId();
            var row = await db.SingleOrDefaultAsync<AdjustmentRule>(
                $"""
                update app.adjustment_rules set pct = @Pct, max_abs_pct = @MaxAbsPct, enabled = @Enabled, updated_at = now(), updated_by = @adminId
                where id = @id returning {Adjustments.Cols}
                """, new { id, body.Pct, body.MaxAbsPct, body.Enabled, adminId }, ct);
            if (row is null) return Results.NotFound();
            await AuthEndpoints.Audit(db, "admin", adminId, "pricing.rule.updated", id.ToString(), http, body, ct);
            return Results.Ok(row);
        }).WithSummary("تعديل نسبة");

        g.MapGet("/settings", (Db db, CancellationToken ct) =>
            db.QueryAsync<PricingSetting>("select key, value, label_ar, updated_at from app.pricing_settings order by key", null, ct))
         .WithSummary("حدود التعديل");

        g.MapPut("/settings/{key}", async (string key, SettingUpdate body, HttpContext http, Db db, CancellationToken ct) =>
        {
            if (body.Value is < 0 or > 50) return Results.ValidationProblem(new Dictionary<string, string[]> { ["value"] = ["القيمة بين 0 و50"] });
            var adminId = http.User.PrincipalId();
            var row = await db.SingleOrDefaultAsync<PricingSetting>(
                "update app.pricing_settings set value = @Value, updated_at = now(), updated_by = @adminId where key = @key returning key, value, label_ar, updated_at",
                new { key, body.Value, adminId }, ct);
            if (row is null) return Results.NotFound();
            await AuthEndpoints.Audit(db, "admin", adminId, "pricing.setting.updated", key, http, body, ct);
            return Results.Ok(row);
        }).WithSummary("تعديل حد");
    }
}
