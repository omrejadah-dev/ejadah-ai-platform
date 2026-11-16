using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Auth;

public sealed record LoginRequest(string Email, string Password);
public sealed record MeDto(string Kind, Guid Id, Guid? AccountId, string Role, string Email, string? Name, bool IsOwner, IReadOnlyList<string> Capabilities, string? AccountName, DateOnly? ExpiresAt);

public static class AuthEndpoints
{
    // wrong passwords per email before a pause; counted from ops.audit_log (auth.login_failed), so no extra table
    private const int MaxFailures = 5, LockMinutes = 15;
    private static readonly string LockedMessage = $"تم إيقاف الدخول مؤقتاً بعد {MaxFailures} محاولات خاطئة، حاول بعد {LockMinutes} دقيقة";
    private const string WrongMessage = "البريد الإلكتروني أو كلمة المرور غير صحيحة";

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");

        // ---- 1. sign in → session (replaces any other active session of this principal) ------
        g.MapPost("/login", async (LoginRequest req, HttpContext http, Db db, TokenService tokens, JwtOptions jwt, CancellationToken ct) =>
        {
            if (!Credentials.TryNormalizeEmail(req.Email, out var email)) return Problems.Invalid("email", "أدخل بريداً إلكترونياً صحيحاً");
            if (string.IsNullOrEmpty(req.Password)) return Problems.Invalid("password", "أدخل كلمة المرور");
            if (await IsLocked(db, email, ct)) return Locked();

            // the password is checked by PostgreSQL against the bcrypt hash; no row = wrong email or wrong password
            var principal = await LoadPrincipalByLogin(db, email, req.Password, ct);
            if (principal is null)
            {
                await Audit.WriteAsync(db, null, null, "auth.login_failed", email, http, null, ct);
                return Results.Problem(title: WrongMessage, statusCode: 401, type: "wrong_credentials");
            }
            if (!principal.IsActive)
                return Results.Problem(title: principal.AccountStatus == AccountStatuses.Expired ? "انتهى الاشتراك، تواصل مع إجادة للتجديد" : "الحساب موقوف، تواصل مع إجادة",
                                       statusCode: 403, type: "account_" + principal.AccountStatus);

            // one transaction: the old sessions, the new one and the audit row go together
            var refresh = TokenService.NewRefreshToken();
            var sessionId = await db.InTransactionAsync(async tx =>
            {
                // single active session per principal
                var replaced = await tx.ExecuteAsync(
                    "update identity.sessions set revoked_at = now(), revoked_reason = 'replaced' where principal_kind = @kind and principal_id = @id and revoked_at is null",
                    new { kind = principal.Kind, id = principal.Id }, ct);
                var id = await tx.ScalarAsync<Guid>(
                    """
                    insert into identity.sessions (principal_kind, principal_id, refresh_hash, expires_at, ip, user_agent)
                    values (@kind, @id, @hash, now() + make_interval(days => @days), @ip, @ua) returning id
                    """,
                    new { kind = principal.Kind, id = principal.Id, hash = TokenService.Sha256(refresh), days = jwt.RefreshDays, ip = http.Connection.RemoteIpAddress?.ToString(), ua = http.Request.Headers.UserAgent.ToString() }, ct);
                await Audit.WriteAsync(tx, principal.Kind, principal.Id, "auth.login", email, http, new { replacedSessions = replaced }, ct);
                return id;
            }, ct);

            SetCookies(http, jwt, tokens.IssueAccess(principal.ToPrincipal(), sessionId), refresh);
            return Results.Ok(principal.ToMe());
        }).RequireRateLimiting(RateLimits.Login).WithSummary("الدخول بالبريد وكلمة المرور. الدخول الجديد يُنهي الجلسة السابقة");

        // ---- 3. refresh (sliding 30 days; rotates the refresh token) -----------------------
        g.MapPost("/refresh", async (HttpContext http, Db db, TokenService tokens, JwtOptions jwt, CancellationToken ct) =>
        {
            if (!http.Request.Cookies.TryGetValue(jwt.RefreshCookie, out var refresh) || string.IsNullOrEmpty(refresh))
                return Results.Problem(title: "لا توجد جلسة", statusCode: 401, type: "no_session");

            var s = await db.SingleOrDefaultAsync<(Guid Id, string Kind, Guid PrincipalId, DateTime ExpiresAt, DateTime? RevokedAt, string? Reason)>(
                "select id, principal_kind, principal_id, expires_at, revoked_at, revoked_reason from identity.sessions where refresh_hash = @hash", new { hash = TokenService.Sha256(refresh) }, ct);
            if (s == default) { ClearCookies(http, jwt); return Results.Problem(title: "الجلسة غير صالحة", statusCode: 401, type: "no_session"); }
            if (s.RevokedAt is not null)
            {
                ClearCookies(http, jwt);
                return s.Reason == "replaced"
                    ? Results.Problem(title: "تم تسجيل الدخول من جهاز آخر", statusCode: 401, type: "session_replaced")
                    : Results.Problem(title: "انتهت الجلسة", statusCode: 401, type: "session_revoked");
            }
            if (s.ExpiresAt < DateTime.UtcNow)
            {
                await db.ExecuteAsync("update identity.sessions set revoked_at = now(), revoked_reason = 'expired' where id = @id", new { id = s.Id }, ct);
                ClearCookies(http, jwt);
                return Results.Problem(title: "انتهت الجلسة، سجّل الدخول من جديد", statusCode: 401, type: "session_expired");
            }

            var principal = await LoadPrincipalById(db, s.Kind, s.PrincipalId, ct);
            if (principal is null || !principal.IsActive)
            {
                await db.ExecuteAsync("update identity.sessions set revoked_at = now(), revoked_reason = 'admin' where id = @id", new { id = s.Id }, ct);
                ClearCookies(http, jwt);
                return Results.Problem(title: "الحساب غير فعّال", statusCode: 403, type: "account_inactive");
            }

            var newRefresh = TokenService.NewRefreshToken();
            await db.ExecuteAsync(
                "update identity.sessions set refresh_hash = @hash, last_seen_at = now(), expires_at = now() + make_interval(days => @days) where id = @id",
                new { hash = TokenService.Sha256(newRefresh), days = jwt.RefreshDays, id = s.Id }, ct);
            SetCookies(http, jwt, tokens.IssueAccess(principal.ToPrincipal(), s.Id), newRefresh);
            return Results.Ok(principal.ToMe());
        }).WithSummary("تجديد الجلسة");

        // ---- 4. logout / me ------------------------------------------------------------------
        g.MapPost("/logout", async (HttpContext http, Db db, JwtOptions jwt, CancellationToken ct) =>
        {
            if (http.Request.Cookies.TryGetValue(jwt.RefreshCookie, out var refresh) && !string.IsNullOrEmpty(refresh))
                await db.ExecuteAsync("update identity.sessions set revoked_at = now(), revoked_reason = 'logout' where refresh_hash = @hash and revoked_at is null", new { hash = TokenService.Sha256(refresh) }, ct);
            ClearCookies(http, jwt);
            return Results.NoContent();
        }).WithSummary("تسجيل الخروج");

        g.MapGet("/me", async (HttpContext http, Db db, CancellationToken ct) =>
        {
            var p = await LoadPrincipalById(db, http.User.Kind(), http.User.PrincipalId(), ct);
            return p is null ? Results.Unauthorized() : Results.Ok(p.ToMe());
        }).RequireAuthorization("authenticated").WithSummary("المستخدم الحالي وصلاحياته");
    }

    // ---- helpers -----------------------------------------------------------------------------
    private static async Task<bool> IsLocked(Db db, string email, CancellationToken ct) =>
        await db.ScalarAsync<int>(
            "select count(*)::int from ops.audit_log where action = 'auth.login_failed' and subject = @email and at > now() - make_interval(mins => @lock)",
            new { email, @lock = LockMinutes }, ct) >= MaxFailures;

    private static IResult Locked() => Results.Problem(title: LockedMessage, statusCode: 429, type: "login_locked");

    private sealed record Row(string Kind, Guid Id, Guid? AccountId, string Role, string Email, string? Name, bool IsOwner, string AccountStatus, string? AccountName, DateOnly? ExpiresAt)
    {
        public Principal ToPrincipal() => new(Kind, Id, AccountId, Role, Email, Name, IsOwner, Capabilities.For(Role, IsOwner));
        public MeDto ToMe() => new(Kind, Id, AccountId, Role, Email, Name, IsOwner, Capabilities.For(Role, IsOwner), AccountName, ExpiresAt);
        /// <summary>Admins sign in while their row exists; seats while the account is active (not expired, not suspended) and the seat is enabled.</summary>
        public bool IsActive => AccountStatus == AccountStatuses.Active;   // admins too: identity.admins.status is active|disabled
    }

    // the account status rule lives in identity.v_account_status (019); a disabled seat signs in like a suspended
    // account, which is an auth-only rule (the admin panel shows the account's own status)
    private const string SeatSql = $"""
        select '{PrincipalKinds.Seat}' as kind, s.id, s.account_id, a.role, s.email, s.display_name as name, s.is_owner,
               case when st.status = '{AccountStatuses.Active}' and s.status <> '{SeatStatuses.Active}' then '{AccountStatuses.Suspended}' else st.status end as account_status,
               a.name as account_name, a.expires_at
        from identity.seats s join identity.accounts a on a.id = s.account_id join identity.v_account_status st on st.account_id = a.id
        """;
    private const string AdminSql = $"""
        select '{PrincipalKinds.Admin}' as kind, id, null::uuid as account_id, '{Roles.Admin}' as role, email, name, true as is_owner, status as account_status, null as account_name, null::date as expires_at
        from identity.admins
        """;

    /// <summary>The principal whose email and password match; null for an unknown email or a wrong password. A principal
    /// with no password yet (password_hash null) never matches. An unknown email still runs one bcrypt, so the answer
    /// takes the same time either way.</summary>
    private static async Task<Row?> LoadPrincipalByLogin(Db db, string email, string password, CancellationToken ct)
    {
        const string match = " = @email and password_hash is not null and password_hash = crypt(@password, password_hash)";
        var row = await db.SingleOrDefaultAsync<Row>(SeatSql + " where s.email" + match.Replace("password_hash", "s.password_hash"), new { email, password }, ct)
               ?? await db.SingleOrDefaultAsync<Row>(AdminSql + " where email" + match, new { email, password }, ct);
        if (row is null) await db.ScalarAsync<string>("select crypt(@password, gen_salt('bf', 10))", new { password }, ct);
        return row;
    }

    private static async Task<Row?> LoadPrincipalById(Db db, string kind, Guid id, CancellationToken ct) =>
        kind == PrincipalKinds.Admin
            ? await db.SingleOrDefaultAsync<Row>(AdminSql + " where id = @id", new { id }, ct)
            : await db.SingleOrDefaultAsync<Row>(SeatSql + " where s.id = @id", new { id }, ct);

    private static void SetCookies(HttpContext http, JwtOptions jwt, string access, string refresh)
    {
        var secure = http.Request.IsHttps;
        http.Response.Cookies.Append(jwt.AccessCookie, access, new CookieOptions { HttpOnly = true, Secure = secure, SameSite = SameSiteMode.Lax, Path = "/", Expires = DateTimeOffset.UtcNow.AddMinutes(jwt.AccessMinutes) });
        http.Response.Cookies.Append(jwt.RefreshCookie, refresh, new CookieOptions { HttpOnly = true, Secure = secure, SameSite = SameSiteMode.Lax, Path = "/api/auth", Expires = DateTimeOffset.UtcNow.AddDays(jwt.RefreshDays) });
    }

    private static void ClearCookies(HttpContext http, JwtOptions jwt)
    {
        http.Response.Cookies.Delete(jwt.AccessCookie, new CookieOptions { Path = "/" });
        http.Response.Cookies.Delete(jwt.RefreshCookie, new CookieOptions { Path = "/api/auth" });
    }
}
