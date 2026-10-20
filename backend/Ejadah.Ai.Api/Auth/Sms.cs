namespace Ejadah.Ai.Api.Auth;

public interface ISmsSender
{
    Task SendOtpAsync(string phoneE164, string code, CancellationToken ct);
}

/// <summary>Development sender: logs the code. Replace with Unifonic/Msegat before launch (Sms:Provider setting).</summary>
public sealed class DummySmsSender(ILogger<DummySmsSender> log) : ISmsSender
{
    public Task SendOtpAsync(string phoneE164, string code, CancellationToken ct)
    {
        log.LogWarning("[DUMMY SMS] to {Phone}: رمز الدخول إلى إجادة: {Code}", PhoneNumber.Mask(phoneE164), code);
        return Task.CompletedTask;
    }
}
