using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Ejadah.Ai.Api.Auth;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "ejadah-ai";
    public string Audience { get; set; } = "ejadah-ai";
    public string SigningKey { get; set; } = "";
    public int AccessMinutes { get; set; } = 15;
    public int RefreshDays { get; set; } = 30;
    public string AccessCookie { get; set; } = "ejd_access";
    public string RefreshCookie { get; set; } = "ejd_refresh";
}

public sealed record Principal(string Kind, Guid Id, Guid? AccountId, string Role, string Phone, string? Name, bool IsOwner, IReadOnlyList<string> Capabilities);

public sealed class TokenService(JwtOptions opt)
{
    private readonly SymmetricSecurityKey _key = new(Encoding.UTF8.GetBytes(opt.SigningKey));
    private readonly JsonWebTokenHandler _handler = new();

    public string IssueAccess(Principal p, Guid sessionId)
    {
        var claims = new Dictionary<string, object>
        {
            ["sub"] = p.Id.ToString(),
            ["kind"] = p.Kind,
            ["sid"] = sessionId.ToString(),
            ["role"] = p.Role,
            ["phone"] = p.Phone,
            ["owner"] = p.IsOwner,
            ["cap"] = p.Capabilities.ToArray(),
        };
        if (p.AccountId is not null) claims["acc"] = p.AccountId.Value.ToString();
        if (p.Name is not null) claims["name"] = p.Name;

        return _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = opt.Issuer, Audience = opt.Audience,
            Claims = claims,
            Expires = DateTime.UtcNow.AddMinutes(opt.AccessMinutes),
            SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256),
        });
    }

    public TokenValidationParameters ValidationParameters => new()
    {
        ValidIssuer = opt.Issuer, ValidAudience = opt.Audience, IssuerSigningKey = _key,
        ValidateIssuer = true, ValidateAudience = true, ValidateIssuerSigningKey = true, ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = "sub", RoleClaimType = "role",
    };

    public static string NewRefreshToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static string Sha256(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();
    public static string NewOtpCode() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
}

public static class ClaimsExtensions
{
    public static Guid PrincipalId(this ClaimsPrincipal u) => Guid.Parse(u.FindFirstValue("sub")!);
    public static Guid SessionId(this ClaimsPrincipal u) => Guid.Parse(u.FindFirstValue("sid")!);
    public static Guid? AccountId(this ClaimsPrincipal u) => Guid.TryParse(u.FindFirstValue("acc"), out var g) ? g : null;
    public static string Role(this ClaimsPrincipal u) => u.FindFirstValue("role") ?? "";
    public static bool Has(this ClaimsPrincipal u, string capability) => u.FindAll("cap").Any(c => c.Value == capability || c.Value == Capabilities.Admin);
}
