using System.Net;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace Ejadah.Ai.Api.Infrastructure;

/// <summary>Request limits (docs/system-design.md section 4). Numbers come from the "RateLimits" settings section so
/// production and development differ only in configuration. nginx applies its own coarser per-IP limit in front.</summary>
public static class RateLimits
{
    public const string Otp = "otp";            // SMS codes per client IP: protects the SMS bill
    public const string Verify = "verify";      // code checks per client IP: on top of the 3-wrong-codes lock per phone
    public const string Estimate = "estimate";  // pricing requests per seat per minute: on top of the daily plan limit
    public const string Legal = "legal";        // legal questions per seat per day (legal assistant)

    public static IServiceCollection AddEjadahRateLimits(this IServiceCollection services, IConfiguration config)
    {
        var c = config.GetSection("RateLimits");
        int Get(string key, int fallback) => c.GetValue(key, fallback);

        services.Configure<ForwardedHeadersOptions>(o =>
        {
            // behind nginx / the Next.js proxy the client IP arrives in X-Forwarded-For; trust only private networks (docker, LAN)
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse("10.0.0.0/8"));
            o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse("172.16.0.0/12"));
            o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse("192.168.0.0/16"));
        });

        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = async (ctx, ct) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
                    ctx.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retry.TotalSeconds)).ToString();
                await Results.Problem(title: "طلبات كثيرة في وقت قصير. انتظر قليلاً ثم حاول مرة أخرى", statusCode: 429, type: "rate_limited")
                             .ExecuteAsync(ctx.HttpContext);
            };

            // everything, per client IP
            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
                RateLimitPartition.GetFixedWindowLimiter(ClientIp(http), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = Get("PerIpPerMinute", 600), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
                }));

            o.AddPolicy(Otp, http => RateLimitPartition.GetFixedWindowLimiter(ClientIp(http), _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Get("OtpPerIpPer10Min", 10), Window = TimeSpan.FromMinutes(10), QueueLimit = 0,
            }));
            o.AddPolicy(Verify, http => RateLimitPartition.GetFixedWindowLimiter(ClientIp(http), _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Get("VerifyPerIpPer10Min", 30), Window = TimeSpan.FromMinutes(10), QueueLimit = 0,
            }));
            o.AddPolicy(Estimate, http => RateLimitPartition.GetTokenBucketLimiter(Seat(http), _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = Get("EstimatesPerMinute", 20), TokensPerPeriod = Get("EstimatesPerMinute", 20),
                ReplenishmentPeriod = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true,
            }));
            o.AddPolicy(Legal, http => RateLimitPartition.GetFixedWindowLimiter(Seat(http), _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Get("LegalPerSeatPerDay", 100), Window = TimeSpan.FromDays(1), QueueLimit = 0,
            }));
        });
        return services;
    }

    private static string ClientIp(HttpContext http) => http.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    /// <summary>The seat (JWT "sub") for signed-in calls; the IP otherwise, so an anonymous caller cannot share one bucket.</summary>
    private static string Seat(HttpContext http) =>
        http.User.FindFirstValue("sub") is { Length: > 0 } sub ? "seat:" + sub : "ip:" + ClientIp(http);
}