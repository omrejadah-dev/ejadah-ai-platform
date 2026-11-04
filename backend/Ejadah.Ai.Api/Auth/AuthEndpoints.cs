using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Auth;

public sealed record OtpRequest(string Phone);
public sealed record VerifyRequest(string Phone, string Code);
public sealed record MeDto(string Kind, Guid Id, Guid? AccountId, string Role, string Phone, string? Name, bool IsOwner, IReadOnlyList<string> Capabilities, string? AccountName, DateOnly? ExpiresAt);

public static class AuthEndpoints
{
    private const int OtpTtlMinutes = 5, OtpMaxAttempts = 3, OtpLockMinutes = 15;
    private static readonly string LockedMessage = $"تم إيقاف الدخول مؤقتاً بعد {OtpMaxAttempts} محاولات خاطئة، حاول بعد {OtpLockMinutes} دقيقة";

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");

        // ---- 1. request a code ------------------------------------------------------------
        g.MapPost("/otp", async (OtpRequest req, HttpContext http, Db db, ISmsSender sms, IWebHostEnvironment env, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!PhoneNumber.TryNormalize(req.Phone, out var phone))
                return Problems.Invalid("phone", "أدخل رقم جوال سعودي صحيح يبدأ بـ 05");

            var principal = await LoadPrincipalByPhone(db, phone, ct);
            if (principal is null)
                return Results.Problem(title: "لا يوجد اشتراك مرتبط بهذا الرقم، تواصل مع إجادة", statusCode: 404, type: "no_subscription");
            if (!principal.IsActive)
                return Results.Problem(title: principal.AccountStatus == AccountStatuses.Expired ? "انتهى الاشتراك، تواصل مع إجادة للتجديد" : "الحساب موقوف، تواصل مع إجادة", statusCode: 403, type: "account_" + principal.AccountStatus);

            var recent = await db.ScalarAsync<int>("select count(*) from identity.otp_codes where phone = @phone and created_at > now() - interval '1 hour'", new { phone }, ct);
            var perHour = cfg.GetValue("Sms:OtpPerHourPerPhone", 5);   // 5 in production, raised in appsettings.Development.json
            if (recent >= perHour)
                return Results.Problem(title: "تجاوزت عدد الرموز المسموح، حاول بعد ساعة", statusCode: 429, type: "otp_rate_limited");
            if (await IsLocked(db, phone, ct)) return Locked();

            var code = TokenService.NewOtpCode();
            await db.ExecuteAsync("insert into identity.otp_codes (phone, code_hash, expires_at, ip) values (@phone, @hash, now() + make_interval(mins => @ttl), @ip)",
                new { phone, hash = TokenService.Sha256(code), ttl = OtpTtlMinutes, ip = http.Connection.RemoteIpAddress?.ToString() }, ct);
            await sms.SendOtpAsync(phone, code, ct);
            await Audit.WriteAsync(db, principal.Kind, principal.Id, "auth.otp_sent", phone, http, null, ct);

            var echo = env.IsDevelopment() && cfg.GetValue("Sms:EchoCodeInResponse", false);
            return Results.Ok(new { sentTo = PhoneNumber.Mask(phone), expiresInSeconds = OtpTtlMinutes * 60, devCode = echo ? code : null });
        }).RequireRateLimiting(RateLimits.Otp).WithSummary("إرسال رمز التحقق (SMS وهمي في التطوير)");

        // ---- 2. verify → session (replaces any other active session of this principal) -----
        g.MapPost("/verify", async (VerifyRequest req, HttpContext http, Db db, TokenService tokens, JwtOptions jwt, CancellationToken ct) =>
        {
            if (!PhoneNumber.TryNormalize(req.Phone, out var phone) || string.IsNullOrWhiteSpace(req.Code))
                return Problems.Invalid("phone", "بيانات غير صالحة");
            if (await IsLocked(db, phone, ct)) return Locked();

            var otp = await db.SingleOrDefaultAsync<(long Id, string CodeHash)>(
                "select id, code_hash from identity.otp_codes where phone = @phone and consumed_at is null and expires_at > now() order by created_at desc limit 1", new { phone }, ct);
            if (otp == default)
                return Results.Problem(title: "انتهت صلاحية الرمز، اطلب رمزاً جديداً", statusCode: 400, type: "otp_expired");

            if (otp.CodeHash != TokenService.Sha256(req.Code.Trim()))
            {
                // counted in one statement: parallel wrong guesses cannot read the same count and slip past the limit
                var attempts = await db.ScalarAsync<int?>(
                    "update identity.otp_codes set attempts = attempts + 1 where id = @id and attempts < @max returning attempts",
                    new { id = otp.Id, max = OtpMaxAttempts }, ct);
                await Audit.WriteAsync(db, null, null, "auth.otp_failed", phone, http, null, ct);
                var left = OtpMaxAttempts - (attempts ?? OtpMaxAttempts);
                return left <= 0 ? Locked() : Results.Problem(title: $"الرمز غير صحيح، المتبقي {left} محاولة", statusCode: 400, type: "otp_wrong");
            }

            var principal = await LoadPrincipalByPhone(db, phone, ct);
            if (principal is null || !principal.IsActive)
                return Results.Problem(title: "لا يوجد اشتراك فعّال لهذا الرقم", statusCode: 403, type: "no_subscription");

            // one transaction: the code is spent once, and the old sessions, the new one and the audit row go together
            var refresh = TokenService.NewRefreshToken();
            var sessionId = await db.InTransactionAsync<Guid?>(async tx =>
            {
                // two requests with the same code: only the one whose update still finds it unspent goes on
                var spent = await tx.ScalarAsync<long?>(
                    "update identity.otp_codes set consumed_at = now() where id = @id and consumed_at is null and attempts < @max and expires_at > now() returning id",
                    new { id = otp.Id, max = OtpMaxAttempts }, ct);
                if (spent is null) return null;

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
                await Audit.WriteAsync(tx, principal.Kind, principal.Id, "auth.login", phone, http, new { replacedSessions = replaced }, ct);
                return id;
            }, ct);
            if (sessionId is null)
                return Results.Problem(title: "انتهت صلاحية الرمز، اطلب رمزاً جديداً", statusCode: 400, type: "otp_expired");

            SetCookies(http, jwt, tokens.IssueAccess(principal.ToPrincipal(), sessionId.Value), refresh);
            return Results.Ok(principal.ToMe());
        }).RequireRateLimiting(RateLimits.Verify).WithSummary("التحقق من الرمز وفتح الجلسة. الدخول الجديد يُنهي الجلسة السابقة");

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
    private static async Task<bool> IsLocked(Db db, string phone, CancellationToken ct) =>
        await db.ScalarAsync<bool>(
            "select exists (select 1 from identity.otp_codes where phone = @phone and attempts >= @max and created_at > now() - make_interval(mins => @lock))",
            new { phone, max = OtpMaxAttempts, @lock = OtpLockMinutes }, ct);

    private static IResult Locked() => Results.Problem(title: LockedMessage, statusCode: 429, type: "otp_locked");

    private sealed record Row(string Kind, Guid Id, Guid? AccountId, string Role, string Phone, string? Name, bool IsOwner, string AccountStatus, string? AccountName, DateOnly? ExpiresAt)
    {
        public Principal ToPrincipal() => new(Kind, Id, AccountId, Role, Phone, Name, IsOwner, Capabilities.For(Role, IsOwner));
        public MeDto ToMe() => new(Kind, Id, AccountId, Role, Phone, Name, IsOwner, Capabilities.For(Role, IsOwner), AccountName, ExpiresAt);
        /// <summary>Admins sign in while their row exists; seats while the account is active (not expired, not suspended) and the seat is enabled.</summary>
        public bool IsActive => AccountStatus == AccountStatuses.Active;   // admins too: identity.admins.status is active|disabled
    }

    // the account status rule lives in identity.v_account_status (019); a disabled seat signs in like a suspended
    // account, which is an auth-only rule (the admin panel shows the account's own status)
    private const string SeatSql = $"""
        select '{PrincipalKinds.Seat}' as kind, s.id, s.account_id, a.role, s.phone, s.display_name as name, s.is_owner,
               case when st.status = '{AccountStatuses.Active}' and s.status <> '{SeatStatuses.Active}' then '{AccountStatuses.Suspended}' else st.status end as account_status,
               a.name as account_name, a.expires_at
        from identity.seats s join identity.accounts a on a.id = s.account_id join identity.v_account_status st on st.account_id = a.id
        """;
    private const string AdminSql = $"""
        select '{PrincipalKinds.Admin}' as kind, id, null::uuid as account_id, '{Roles.Admin}' as role, phone, name, true as is_owner, status as account_status, null as account_name, null::date as expires_at
        from identity.admins
        """;

    private static async Task<Row?> LoadPrincipalByPhone(Db db, string phone, CancellationToken ct) =>
        await db.SingleOrDefaultAsync<Row>(SeatSql + " where s.phone = @phone", new { phone }, ct)
        ?? await db.SingleOrDefaultAsync<Row>(AdminSql + " where phone = @phone", new { phone }, ct);

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
