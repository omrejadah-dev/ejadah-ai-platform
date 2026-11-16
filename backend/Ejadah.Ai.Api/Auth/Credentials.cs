using System.Net.Mail;

namespace Ejadah.Ai.Api.Auth;

/// <summary>Sign-in credentials: an email (stored lower-case) and a password. The password itself is hashed and checked in
/// PostgreSQL (pgcrypto bcrypt, migration 022), so the API only validates its shape and passes it as a query parameter.</summary>
public static class Credentials
{
    public const int PasswordMin = 8, PasswordMax = 128;
    public const string PasswordRule = "كلمة المرور 8 أحرف على الأقل";

    /// <summary>Trimmed, lower-case, one address with a dotted domain: name@company.com.</summary>
    public static bool TryNormalizeEmail(string? input, out string email)
    {
        email = "";
        var s = input?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(s) || s.Length > 254 || s.Contains(' ')) return false;
        if (!MailAddress.TryCreate(s, out var a) || a.Address != s) return false;
        var at = s.LastIndexOf('@');
        if (at < 1 || !s[(at + 1)..].Contains('.') || s.EndsWith('.')) return false;
        email = s;
        return true;
    }

    public static bool IsValidPassword(string? password) =>
        password is { Length: >= PasswordMin and <= PasswordMax } && !string.IsNullOrWhiteSpace(password);

    /// <summary>SQL that turns the @password parameter into a bcrypt hash (cost 10, ~60 ms).</summary>
    public const string HashSql = "crypt(@password, gen_salt('bf', 10))";
}
