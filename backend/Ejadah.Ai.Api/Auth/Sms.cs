namespace Ejadah.Ai.Api.Auth;

/// <summary>Sends the sign-in code. The real provider (Unifonic/Msegat) implements this and is picked by Sms:Provider.</summary>
public interface ISmsSender
{
    Task SendOtpAsync(string phoneE164, string code, CancellationToken ct);
}

/// <summary>Development sender: logs the code. Registered in Development only (see <see cref="SmsRegistration"/>).</summary>
public sealed class DummySmsSender(ILogger<DummySmsSender> log) : ISmsSender
{
    public Task SendOtpAsync(string phoneE164, string code, CancellationToken ct)
    {
        log.LogWarning("[DUMMY SMS] to {Phone}: رمز الدخول إلى إجادة: {Code}", PhoneNumber.Mask(phoneE164), code);
        return Task.CompletedTask;
    }
}

public static class SmsRegistration
{
    public const string Dummy = "dummy";

    /// <summary>Sms:Provider picks the sender. Outside Development a missing or "dummy" provider stops startup:
    /// the dummy sender writes every sign-in code to the log, and nobody would receive an SMS.</summary>
    public static IServiceCollection AddEjadahSms(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        var provider = config["Sms:Provider"];
        if (string.IsNullOrWhiteSpace(provider) || provider.Equals(Dummy, StringComparison.OrdinalIgnoreCase))
        {
            // Sms:AllowDummy is the explicit opt-in for a local rehearsal of the production stack (infra/local-rehearsal.env)
            if (!env.IsDevelopment() && !config.GetValue("Sms:AllowDummy", false))
                throw new InvalidOperationException("Sms:Provider must name a real SMS provider outside Development (the dummy sender logs the codes); set Sms:AllowDummy=true only for a local rehearsal");
            services.AddSingleton<ISmsSender, DummySmsSender>();
            return services;
        }
        // a real provider is registered here once it exists (its ISmsSender plus Sms:<Provider> settings)
        throw new InvalidOperationException($"Sms:Provider '{provider}' is not implemented");
    }
}
