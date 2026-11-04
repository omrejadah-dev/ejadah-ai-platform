namespace Ejadah.Ai.Api.Auth;

/// <summary>Who signed in: identity.sessions.principal_kind, the "kind" claim, ops.audit_log.actor_kind.</summary>
public static class PrincipalKinds
{
    public const string Seat = "seat";
    public const string Admin = "admin";
}

/// <summary>identity.accounts.role (plus "admin" for identity.admins), the "role" claim.</summary>
public static class Roles
{
    public const string Broker = "broker";
    public const string Office = "office";
    public const string Investor = "investor";
    public const string Developer = "developer";
    public const string Admin = "admin";
}

/// <summary>Effective account status (identity.v_account_status); sign-in adds Suspended for a disabled seat.</summary>
public static class AccountStatuses
{
    public const string Active = "active";
    public const string Suspended = "suspended";
    public const string Expired = "expired";
}

/// <summary>identity.seats.status.</summary>
public static class SeatStatuses
{
    public const string Active = "active";
    public const string Disabled = "disabled";
}
