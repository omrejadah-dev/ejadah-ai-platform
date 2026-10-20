using System.Text.Json;
using Ejadah.Ai.Api.Infrastructure;

namespace Ejadah.Ai.Api.Auth;

public sealed record OtpRequest(string Phone);
public sealed record VerifyRequest(string Phone, string Code);
public sealed record MeDto(string Kind, Guid Id, Guid? AccountId, string Role, string Phone, string? Name, bool IsOwner, IReadOnlyList<string> Capabilities, string? AccountName, DateOnly? ExpiresAt);

public static class AuthEndpoints
{
    private const int OtpTtlMinutes = 5, OtpMaxAttempts = 3, OtpLockMinutes = 15;

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");

        // ---- 1. request a code ------------------------------------------------------------
        g.MapPost("/otp", async (OtpRequest req, HttpContext http, Db db, ISmsSender sms, IWebHostEnvironment env, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!PhoneNumber.TryNormalize(req.Phone, out var phone))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["phone"] = ["أدخل رقم جوال سعودي صحيح يبدأ بـ 05"] });

            var principal = await LoadPrincipalByPhone(db, phone, ct);
            if (principal is null)
                return Results.Problem(title: "لا يوجد اشتراك مرتبط بهذا الرقم، تواصل مع إجادة", statusCode: 404, type: "no_subscription");
            if (principal.Kind == "seat" && principal.AccountStatus != "active")
                return Results.Problem(title: principal.AccountStatus == "expired" ? "انتهى الاشتراك، تواصل مع إجادة للتجديد" : "الحساب موقوف، تواصل مع إجادة", statusCode: 403, type: "account_" + principal.AccountStatus);

            var recent = await db.ScalarAsync<int>("select count(*) from identity.otp_codes where phone = @phone and created_at > now() - interval '1 hour'", new { phone }, ct);
            var perHour = cfg.GetValue("Sms:OtpPerHourPerPhone", 5);   // 5 in production, raised in appsettings.Development.json
            if (recent >= perHour)
                return Results.Problem(title: "تجاوزت عدد الرموز المسموح، حاول بعد ساعة", statusCode: 429, type: "otp_rate_limited");
            if (await IsLocked(db, phone, ct))
                return Results.Problem(title: "تم إيقاف الدخول مؤقتاً بعد محاولات خاطئة، حاول بعد 15 دقيقة", statusCode: 429, type: "otp_locked");

            var code = TokenService.NewOtpCode();
            await db.ExecuteAsync("insert into identity.otp_codes (phone, code_hash, expires_at, ip) values (@phone, @hash, now() + make_interval(mins => @ttl), @ip)",
                new { phone, hash = TokenService.Sha256(code), ttl = OtpTtlMinutes, ip = http.Connection.RemoteIpAddress?.ToString() }, ct);
            await sms.SendOtpAsync(phone, code, ct);
            await Audit(db, principal.Kind, principal.Id, "auth.otp_sent", phone, http, null, ct);

            var echo = env.IsDevelopment() && cfg.GetValue("Sms:EchoCodeInResponse", false);
            return Results.Ok(new { sentTo = PhoneNumber.Mask(phone), expiresInSeconds = OtpTtlMinutes * 60, devCode = echo ? code : null });
        }).WithSummary("إرسال رمز التحقق (SMS وهمي في التطوير)");

        // ---- 2. verify → session (replaces any other active session of this principal) -----
        g.MapPost("/verify", async (VerifyRequest req, HttpContext http, Db db, TokenService tokens, JwtOptions jwt, CancellationToken ct) =>
        {
            if (!PhoneNumber.TryNormalize(req.Phone, out var phone) || string.IsNullOrWhiteSpace(req.Code))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["phone"] = ["بيانات غير صالحة"] });
            if (await IsLocked(db, phone, ct))
                return Results.Problem(title: "تم إيقاف الدخول مؤقتاً بعد محاولات خاطئة، حاول بعد 15 دقيقة", statusCode: 429, type: "otp_locked");

            var otp = await db.SingleOrDefaultAsync<(long Id, string CodeHash, int Attempts)>(
                "select id, code_hash, attempts from identity.otp_codes where phone = @phone and consumed_at is null and expires_at > now() order by created_at desc limit 1", new { phone }, ct);
            if (otp == default)
                return Results.Problem(title: "انتهت صلاحية الرمز، اطلب رمزاً جديداً", statusCode: 400, type: "otp_expired");

            if (otp.CodeHash != TokenService.Sha256(req.Code.Trim()))
            {
                await db.ExecuteAsync("update identity.otp_codes set attempts = attempts + 1 where id = @id", new { id = otp.Id }, ct);
                await Audit(db, null, null, "auth.otp_failed", phone, http, null, ct);
                var left = OtpMaxAttempts - (otp.Attempts + 1);
                return left <= 0
                    ? Results.Problem(title: "تم إيقاف الدخول مؤقتاً بعد ثلاث محاولات خاطئة، حاول بعد 15 دقيقة", statusCode: 429, type: "otp_locked")
                    : Results.Problem(title: $"الرمز غير صحيح، المتبقي {left} محاولة", statusCode: 400, type: "otp_wrong");
            }

            var principal = await LoadPrincipalByPhone(db, phone, ct);
            if (principal is null || (principal.Kind == "seat" && principal.AccountStatus != "active"))
                return Results.Problem(title: "لا يوجد اشتراك فعّال لهذا الرقم", statusCode: 403, type: "no_subscription");

            await db.ExecuteAsync("update identity.otp_codes set consumed_at = now() where id = @id", new { id = otp.Id }, ct);

            // single active session per principal
            var replaced = await db.ExecuteAsync(
                "update identity.sessions set revoked_at = now(), revoked_reason = 'replaced' where principal_kind = @kind and principal_id = @id and revoked_at is null",
                new { kind = principal.Kind, id = principal.Id }, ct);

            var refresh = TokenService.NewRefreshToken();
            var sessionId = await db.ScalarAsync<Guid>(
                """
                insert into identity.sessions (principal_kind, principal_id, refresh_hash, expires_at, ip, user_agent)
                values (@kind, @id, @hash, now() + make_interval(days => @days), @ip, @ua) returning id
                """,
                new { kind = principal.Kind, id = principal.Id, hash = TokenService.Sha256(refresh), days = jwt.RefreshDays, ip = http.Connection.RemoteIpAddress?.ToString(), ua = http.Request.Headers.UserAgent.ToString() }, ct);

            await Audit(db, principal.Kind, principal.Id, "auth.login", phone, http, new { replacedSessions = replaced }, ct);
            SetCookies(http, jwt, tokens.IssueAccess(principal.ToPrincipal(), sessionId), refresh);
            return Results.Ok(principal.ToMe() with { });
        }).WithSummary("التحقق من الرمز وفتح الجلسة. الدخول الجديد يُنهي الجلسة السابقة");

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
            if (principal is null || (principal.Kind == "seat" && principal.AccountStatus != "active"))
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
            var u = http.User;
            var kind = u.FindFirst("kind")?.Value ?? "seat";
            var p = await LoadPrincipalById(db, kind, u.PrincipalId(), ct);
            return p is null ? Results.Unauthorized() : Results.Ok(p.ToMe());
        }).RequireAuthorization("authenticated").WithSummary("المستخدم الحالي وصلاحياته");
    }

    // ---- helpers -----------------------------------------------------------------------------
    private static async Task<bool> IsLocked(Db db, string phone, CancellationToken ct) =>
        await db.ScalarAsync<bool>(
            "select exists (select 1 from identity.otp_codes where phone = @phone and attempts >= @max and created_at > now() - make_interval(mins => @lock))",
            new { phone, max = OtpMaxAttempts, @lock = OtpLockMinutes }, ct);

    private sealed record Row(string Kind, Guid Id, Guid? AccountId, string Role, string Phone, string? Name, bool IsOwner, string AccountStatus, string? AccountName, DateOnly? ExpiresAt)
    {
        public Principal ToPrincipal() => new(Kind, Id, AccountId, Role, Phone, Name, IsOwner, Capabilities.For(Role, IsOwner));
        public MeDto ToMe() => new(Kind, Id, AccountId, Role, Phone, Name, IsOwner, Capabilities.For(Role, IsOwner), AccountName, ExpiresAt);
    }

    private const string SeatSql = """
        select 'seat' as kind, s.id, s.account_id, a.role, s.phone, s.display_name as name, s.is_owner,
               case when a.status = 'active' and a.expires_at < current_date then 'expired' when s.status <> 'active' then 'suspended' else a.status end as account_status,
               a.name as account_name, a.expires_at
        from identity.seats s join identity.accounts a on a.id = s.account_id
        """;
    private const string AdminSql = """
        select 'admin' as kind, id, null::uuid as account_id, 'admin' as role, phone, name, true as is_owner, status as account_status, null as account_name, null::date as expires_at
        from identity.admins
        """;

    private static async Task<Row?> LoadPrincipalByPhone(Db db, string phone, CancellationToken ct) =>
        await db.SingleOrDefaultAsync<Row>(SeatSql + " where s.phone = @phone", new { phone }, ct)
        ?? await db.SingleOrDefaultAsync<Row>(AdminSql + " where phone = @phone", new { phone }, ct);

    private static async Task<Row?> LoadPrincipalById(Db db, string kind, Guid id, CancellationToken ct) =>
        kind == "admin"
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

    public static Task Audit(Db db, string? actorKind, Guid? actorId, string action, string? subject, HttpContext http, object? data, CancellationToken ct) =>
        db.ExecuteAsync("insert into ops.audit_log (actor_kind, actor_id, action, subject, data, ip) values (@k, @a, @action, @subject, @data::jsonb, @ip)",
            new { k = actorKind, a = actorId, action, subject, data = data is null ? null : JsonSerializer.Serialize(data), ip = http.Connection.RemoteIpAddress?.ToString() }, ct);
}
