using Ejadah.Ai.Api.Admin;
using Ejadah.Ai.Api.Ai;
using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Estimates;
using Ejadah.Ai.Api.Infrastructure;
using Ejadah.Ai.Api.Legal;
using Ejadah.Ai.Api.Market;
using Scalar.AspNetCore;

// container health check (the aspnet image has no curl): `dotnet Ejadah.Ai.Api.dll --healthcheck` asks the running server for /health
if (args.Contains("--healthcheck"))
{
    using var probe = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
    try { Environment.Exit((await probe.GetAsync("http://127.0.0.1:8080/health")).IsSuccessStatusCode ? 0 : 1); }
    catch { Environment.Exit(1); }
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddMemoryCache();
builder.Services.AddEjadahDatabase(builder.Configuration);
builder.Services.AddEjadahAuth(builder.Configuration, builder.Environment);
builder.Services.AddEjadahAi(builder.Configuration);   // Claude once an Anthropic key is set, the trial reader until then
builder.Services.AddEjadahRateLimits(builder.Configuration);
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:3000"])
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

app.UseForwardedHeaders();   // real client IP from nginx / the Next.js proxy, for the per-IP limits
app.UseExceptionHandler();
app.UseStatusCodePages();
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(o => o.WithTitle("Ejadah AI API"));
}
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();        // after authentication so per-seat limits see the signed-in seat

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).ExcludeFromDescription();
app.MapGet("/ready", async (Db db, INotesAssessor ai, CancellationToken ct) =>
{
    var asOf = await db.ScalarAsync<DateTime?>("select data_as_of from market.v_meta", ct: ct);
    return asOf is null ? Results.Problem("market data not loaded", statusCode: 503) : Results.Ok(new { status = "ready", dataAsOf = asOf, ai = ai.Provider });
}).ExcludeFromDescription();

app.MapAuthEndpoints();
app.MapMarketEndpoints();
app.MapMapEndpoints();
app.MapEstimateEndpoints();
app.MapAdminPricingEndpoints();
app.MapAdminEndpoints();
app.MapLegalEndpoints();

app.Run();
