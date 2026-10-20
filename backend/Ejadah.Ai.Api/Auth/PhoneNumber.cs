using System.Text.RegularExpressions;

namespace Ejadah.Ai.Api.Auth;

/// <summary>Saudi mobile numbers only. Accepts 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX (Arabic-Indic digits allowed); returns +9665XXXXXXXX.</summary>
public static partial class PhoneNumber
{
    public static bool TryNormalize(string? input, out string e164)
    {
        e164 = "";
        if (string.IsNullOrWhiteSpace(input)) return false;
        var digits = new string(input.Select(c => c switch
        {
            >= '٠' and <= '٩' => (char)('0' + (c - '٠')),
            >= '۰' and <= '۹' => (char)('0' + (c - '۰')),
            _ => c,
        }).Where(char.IsDigit).ToArray());

        if (digits.StartsWith("966")) digits = digits[3..];
        if (digits.StartsWith("0")) digits = digits[1..];
        if (!SaudiMobile().IsMatch(digits)) return false;
        e164 = "+966" + digits;
        return true;
    }

    public static string Mask(string e164) => e164.Length > 3 ? new string('*', e164.Length - 3) + e164[^3..] : e164;

    [GeneratedRegex(@"^5\d{8}$")]
    private static partial Regex SaudiMobile();
}
