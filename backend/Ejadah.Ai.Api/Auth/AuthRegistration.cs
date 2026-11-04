using Microsoft.AspNetCore.Authentication.JwtBearer;

namespace Ejadah.Ai.Api.Auth;

public static class AuthRegistration
{
    public static IServiceCollection AddEjadahAuth(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        var opt = config.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
        if (string.IsNullOrWhiteSpace(opt.SigningKey))
        {
            if (!env.IsDevelopment()) throw new InvalidOperationException("Jwt:SigningKey must be set outside Development (64+ chars)");
            opt.SigningKey = "dev-only-signing-key-change-me-dev-only-signing-key-change-me-0123456789";
        }
        if (opt.SigningKey.Length < 64) throw new InvalidOperationException("Jwt:SigningKey must be at least 64 characters");

        services.AddSingleton(opt);
        services.AddSingleton<TokenService>();
        services.AddEjadahSms(config, env);

        // validation parameters come from the one TokenService in DI (same signing key as the tokens it issues)
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
                .Configure<TokenService>((o, tokens) => o.TokenValidationParameters = tokens.ValidationParameters);
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
        {
            o.MapInboundClaims = false;
            o.Events = new JwtBearerEvents
            {
                // Accept the access token from the HttpOnly cookie as well as the Authorization header
                OnMessageReceived = ctx =>
                {
                    if (string.IsNullOrEmpty(ctx.Token) && ctx.Request.Cookies.TryGetValue(opt.AccessCookie, out var c)) ctx.Token = c;
                    return Task.CompletedTask;
                },
            };
        });

        services.AddAuthorizationBuilder()
            .AddPolicy("authenticated", p => p.RequireAuthenticatedUser())
            .AddPolicy(Capabilities.Admin, p => p.RequireClaim("cap", Capabilities.Admin));
        foreach (var cap in Capabilities.All.Where(c => c != Capabilities.Admin))
            services.AddAuthorizationBuilder().AddPolicy(cap, p => p.RequireAssertion(ctx => ctx.User.Has(cap)));

        return services;
    }
}
