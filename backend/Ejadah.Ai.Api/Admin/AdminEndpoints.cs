using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;
using Npgsql;
using static Ejadah.Ai.Api.Infrastructure.Problems;

namespace Ejadah.Ai.Api.Admin;

/// <summary>
/// Admin panel (PLAN.md phase F): accounts and their login, sign-outs, and the legal questions log.
/// One account = one login (027: no seats); the login is a row of identity.seats, which sign-in uses. Moving a
/// subscription to another person is a login email change here, and the admin sets or resets passwords; there is
/// no self-service yet. Suspending, disabling, a new email or a new password revokes the sessions at once; an access token already issued lives out its 15 minutes.
/// Each change and its audit row commit together.
/// </summary>
public static class AdminEndpoints
{

    public sealed record PlanDto(int Id, string Code, string Name, string Role, int DailyEstimateLimit, int DurationDays, decimal? PriceSar);

    public sealed record AccountDto(Guid Id, string Name, string Role, int? PlanId, string? PlanName,
                                    string Status, DateOnly StartsAt, DateOnly ExpiresAt, DateTime CreatedAt, string? OwnerEmail,
                                    DateTime? LastSeenAt, int Estimates30d, int Legal30d, string? Notes);
    public sealed record SeatDto(Guid Id, string Email, string? DisplayName, bool IsOwner, string Status, DateTime CreatedAt,
                                 DateTime? LastSeenAt, bool Online, string? Ip, string? UserAgent, int Estimates30d, int Legal30d);
    /// <summary>The account and its one login (null only if it was never created).</summary>
    public sealed record AccountDetailDto(AccountDto Account, SeatDto? Login);

    public sealed record CreateAccount(string Name, int PlanId, DateOnly? ExpiresAt, string OwnerEmail, string OwnerPassword, string? OwnerName, string? Notes);
    public sealed record UpdateAccount(string Name, int PlanId, string Status, DateOnly ExpiresAt, string? Notes);
    public sealed record UpdateSeat(string Email, string? DisplayName, string Status, string? Password);   // Password: only to reset it

    public sealed record LegalQuestionDto(Guid Id, DateTime CreatedAt, string Question, string Answer, string Provider, int Cited,
                                          int? DurationMs, string? Email, string? AccountName, string? Search);

    // status: identity.v_account_status (019) — past its end date counts as expired even while the row still says active
    private const string AccountSql = $"""
        select a.id, a.name, a.role, a.plan_id, p.name as plan_name,
               st.status, a.starts_at, a.expires_at, a.created_at,
               (select s.email from identity.seats s where s.account_id = a.id and s.is_owner order by s.created_at limit 1) as owner_email,
               (select max(se.last_seen_at) from identity.sessions se join identity.seats s on s.id = se.principal_id
                 where se.principal_kind = '{PrincipalKinds.Seat}' and s.account_id = a.id) as last_seen_at,
               (select count(*) from app.valuations v where v.account_id = a.id and v.created_at > now() - interval '30 days')::int as estimates_30d,
               (select count(*) from app.legal_questions q join identity.seats s on s.id = q.seat_id
                 where s.account_id = a.id and q.created_at > now() - interval '30 days')::int as legal_30d,
               a.notes
        from identity.accounts a join identity.v_account_status st on st.account_id = a.id
        left join identity.plans_catalog p on p.id = a.plan_id
        """;

    private const string SeatSql = $"""
        select s.id, s.email, s.display_name, s.is_owner, s.status, s.created_at,
               last.last_seen_at, coalesce(last.online, false) as online, last.ip, last.user_agent,
               (select count(*) from app.valuations v where v.seat_id = s.id and v.created_at > now() - interval '30 days')::int as estimates_30d,
               (select count(*) from app.legal_questions q where q.seat_id = s.id and q.created_at > now() - interval '30 days')::int as legal_30d
        from identity.seats s
        left join lateral (
          select se.last_seen_at, se.revoked_at is null and se.expires_at > now() as online, se.ip, se.user_agent
          from identity.sessions se where se.principal_kind = '{PrincipalKinds.Seat}' and se.principal_id = s.id
          order by se.last_seen_at desc limit 1) last on true
        """;

    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").WithTags("Admin").RequireAuthorization(Capabilities.Admin);

        g.MapGet("/plans", (Db db, CancellationToken ct) =>
            db.QueryAsync<PlanDto>("select id, code, name, role, daily_estimate_limit, duration_days, price_sar from identity.plans_catalog order by id", null, ct))
         .WithSummary("الباقات");

        // ---- accounts ------------------------------------------------------------------------------
        g.MapGet("/accounts", (string? q, Db db, CancellationToken ct) =>
        {
            q = string.IsNullOrWhiteSpace(q) ? null : q.Trim();
            return db.QueryAsync<AccountDto>(AccountSql + """
                 where @q::text is null or a.name ilike '%' || @q || '%'
                    or exists (select 1 from identity.seats s where s.account_id = a.id and s.email like '%' || lower(@q) || '%')
                 order by a.created_at desc limit 500
                """, new { q }, ct);
        }).WithSummary("الحسابات (بحث بالاسم أو البريد)");

        g.MapGet("/accounts/{id:guid}", async (Guid id, Db db, CancellationToken ct) =>
        {
            var a = await db.SingleOrDefaultAsync<AccountDto>(AccountSql + " where a.id = @id", new { id }, ct);
            if (a is null) return Results.NotFound();
            var login = await db.SingleOrDefaultAsync<SeatDto>(SeatSql + " where s.account_id = @id", new { id }, ct);
            return Results.Ok(new AccountDetailDto(a, login));
        }).WithSummary("حساب وبيانات دخوله");

        g.MapPost("/accounts", async (CreateAccount body, HttpContext http, Db db, CancellationToken ct) =>
        {
            var name = body.Name?.Trim() ?? "";
            if (name.Length is < 2 or > 120) return Invalid("name", "اكتب اسم الحساب");
            if (!Credentials.TryNormalizeEmail(body.OwnerEmail, out var email)) return Invalid("ownerEmail", "بريد إلكتروني صحيح");
            if (!Credentials.IsValidPassword(body.OwnerPassword)) return Invalid("ownerPassword", Credentials.PasswordRule);
            var plan = await db.SingleOrDefaultAsync<PlanDto>(
                "select id, code, name, role, daily_estimate_limit, duration_days, price_sar from identity.plans_catalog where id = @PlanId", new { body.PlanId }, ct);
            if (plan is null) return Invalid("planId", "اختر باقة");
            var expires = body.ExpiresAt ?? DateOnly.FromDateTime(DateTime.Today).AddDays(plan.DurationDays);
            if (await EmailTaken(db, email, null, ct)) return Taken();

            var adminId = http.User.PrincipalId();
            try
            {
                var id = await db.InTransactionAsync(async tx =>
                {
                    var id = await tx.ScalarAsync<Guid>("""
                        with a as (
                          insert into identity.accounts (name, role, plan_id, expires_at, notes)
                          values (@name, @role, @planId, @expires, @notes) returning id)
                        insert into identity.seats (account_id, email, password_hash, display_name, is_owner)
                        select id, @email, crypt(@password, gen_salt('bf', 10)), @ownerName, true from a returning account_id
                        """, new { name, role = plan.Role, planId = plan.Id, expires, notes = Clean(body.Notes), email, password = body.OwnerPassword, ownerName = Clean(body.OwnerName) ?? name }, ct);
                    await Audit.WriteAsync(tx, PrincipalKinds.Admin, adminId, "admin.account.created", id.ToString(), http, new { name, plan = plan.Code, expires, email }, ct);
                    return id;
                }, ct);
                return Results.Ok(new { id });
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return Taken(); }
        }).WithSummary("حساب جديد مع بيانات دخوله");

        g.MapPut("/accounts/{id:guid}", async (Guid id, UpdateAccount body, HttpContext http, Db db, CancellationToken ct) =>
        {
            var name = body.Name?.Trim() ?? "";
            if (name.Length is < 2 or > 120) return Invalid("name", "اكتب اسم الحساب");
            if (body.Status is not (AccountStatuses.Active or AccountStatuses.Suspended)) return Invalid("status", "الحالة: فعّال أو موقوف");

            var adminId = http.User.PrincipalId();
            return await db.InTransactionAsync(async tx =>
            {
                if (!await LockAccount(tx, id, ct)) return Results.NotFound();
                var n = await tx.ExecuteAsync("""
                    update identity.accounts a set name = @name, plan_id = p.id, role = p.role,
                           status = @Status, expires_at = @ExpiresAt, notes = @notes
                    from identity.plans_catalog p where a.id = @id and p.id = @PlanId
                    """, new { id, name, body.PlanId, body.Status, body.ExpiresAt, notes = Clean(body.Notes) }, ct);
                if (n == 0) return Results.NotFound();
                if (body.Status == AccountStatuses.Suspended) await RevokeAccount(tx, id, ct);
                await Audit.WriteAsync(tx, PrincipalKinds.Admin, adminId, "admin.account.updated", id.ToString(), http, body, ct);
                return Results.NoContent();
            }, ct);
        }).WithSummary("تعديل الحساب: الباقة، الانتهاء، الإيقاف");

        // ---- the account's login (a row of identity.seats) ---------------------------------------------

        g.MapPut("/seats/{id:guid}", async (Guid id, UpdateSeat body, HttpContext http, Db db, CancellationToken ct) =>
        {
            if (!Credentials.TryNormalizeEmail(body.Email, out var email)) return Invalid("email", "بريد إلكتروني صحيح");
            if (body.Status is not (SeatStatuses.Active or SeatStatuses.Disabled)) return Invalid("status", "الحالة: فعّال أو معطّل");
            var newPassword = string.IsNullOrEmpty(body.Password) ? null : body.Password;
            if (newPassword is not null && !Credentials.IsValidPassword(newPassword)) return Invalid("password", Credentials.PasswordRule);
            var old = await db.SingleOrDefaultAsync<(string Email, string Status)>("select email, status from identity.seats where id = @id", new { id }, ct);
            if (old == default) return Results.NotFound();
            var moved = email != old.Email;
            if (moved && await EmailTaken(db, email, id, ct)) return Taken();
            try
            {
                await db.InTransactionAsync(async tx =>
                {
                    await tx.ExecuteAsync("update identity.seats set email = @email, display_name = @name, status = @Status where id = @id",
                        new { id, email, name = Clean(body.DisplayName), body.Status }, ct);
                    if (newPassword is not null)
                        await tx.ExecuteAsync("update identity.seats set password_hash = " + Credentials.HashSql + " where id = @id", new { id, password = newPassword }, ct);
                    // a new email, a new password or a disabled seat must not keep the old device signed in
                    if (moved || newPassword is not null || body.Status == SeatStatuses.Disabled) await RevokeSeat(tx, id, ct);
                    await Audit.WriteAsync(tx, PrincipalKinds.Admin, http.User.PrincipalId(), moved ? "admin.seat.email_changed" : "admin.seat.updated",
                        id.ToString(), http, new { from = old.Email, to = email, body.Status, passwordReset = newPassword is not null }, ct);
                    return 0;
                }, ct);
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return Taken(); }
            return Results.NoContent();
        }).WithSummary("تعديل الدخول: نقل الاشتراك لبريد آخر، الاسم، كلمة المرور، التعطيل");


        g.MapPost("/seats/{id:guid}/signout", (Guid id, HttpContext http, Db db, CancellationToken ct) =>
            db.InTransactionAsync(async tx =>
            {
                var n = await RevokeSeat(tx, id, ct);
                await Audit.WriteAsync(tx, PrincipalKinds.Admin, http.User.PrincipalId(), "admin.seat.signed_out", id.ToString(), http, new { sessions = n }, ct);
                return Results.Ok(new { sessions = n });
            }, ct))
         .WithSummary("تسجيل خروج الحساب من جهازه الحالي");

        // ---- logs ----------------------------------------------------------------------------------
        g.MapGet("/legal-questions", (int? limit, Db db, CancellationToken ct) =>
            db.QueryAsync<LegalQuestionDto>("""
                select q.id, q.created_at, q.question, q.answer, q.provider, cardinality(q.cited) as cited, q.duration_ms,
                       s.email, a.name as account_name, q.search
                from app.legal_questions q
                left join identity.seats s on s.id = q.seat_id left join identity.accounts a on a.id = s.account_id
                order by q.created_at desc limit @limit
                """, new { limit = Math.Clamp(limit ?? 100, 1, 500) }, ct))
         .WithSummary("أسئلة المساعد القانوني، لمراجعة الجودة");
    }

    // ---- helpers -----------------------------------------------------------------------------------
    private static IResult Taken() =>
        Results.Problem(title: "هذا البريد مسجل في اشتراك آخر", statusCode: 409, type: "email_taken");

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>One email signs in as one principal: taken by another seat or by an admin.</summary>
    private static Task<bool> EmailTaken(Db db, string email, Guid? exceptSeat, CancellationToken ct) =>
        db.ScalarAsync<bool>("""
            select exists (select 1 from identity.seats where email = @email and id is distinct from @exceptSeat)
                or exists (select 1 from identity.admins where email = @email)
            """, new { email, exceptSeat }, ct);

    /// <summary>Locks the account row until the transaction ends; false when there is no such account. Its own statement:
    /// a statement that waited for the lock keeps its old snapshot, so counts must be read by the next one.</summary>
    private static async Task<bool> LockAccount(DbTx tx, Guid id, CancellationToken ct) =>
        await tx.ScalarAsync<int?>("select 1 from identity.accounts where id = @id for update", new { id }, ct) is not null;

    /// <summary>Revokes the live sessions of one seat (reason 'admin'); returns how many.</summary>
    private static Task<int> RevokeSeat(ISql db, Guid seatId, CancellationToken ct) =>
        db.ExecuteAsync($"""
            update identity.sessions set revoked_at = now(), revoked_reason = 'admin'
            where principal_kind = '{PrincipalKinds.Seat}' and revoked_at is null and principal_id = @seatId
            """, new { seatId }, ct);

    /// <summary>Revokes the live sessions of every seat of an account (reason 'admin'); returns how many.</summary>
    private static Task<int> RevokeAccount(ISql db, Guid accountId, CancellationToken ct) =>
        db.ExecuteAsync($"""
            update identity.sessions se set revoked_at = now(), revoked_reason = 'admin'
            from identity.seats s
            where se.principal_kind = '{PrincipalKinds.Seat}' and se.revoked_at is null and se.principal_id = s.id and s.account_id = @accountId
            """, new { accountId }, ct);
}
