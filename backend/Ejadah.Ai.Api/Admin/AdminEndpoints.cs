using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;
using Npgsql;
using static Ejadah.Ai.Api.Infrastructure.Problems;

namespace Ejadah.Ai.Api.Admin;

/// <summary>
/// Admin panel (PLAN.md phase F): overview, accounts and their seats, sign-outs, and the legal questions log.
/// Moving a subscription to another phone is a seat phone change here; there is no self-service.
/// Suspending, disabling or re-numbering revokes the sessions at once; an access token already issued lives out its 15 minutes.
/// Each change and its audit row commit together.
/// </summary>
public static class AdminEndpoints
{
    public sealed record DayDto(DateOnly Day, int Estimates, int Legal);
    public sealed record OverviewDto(int AccountsActive, int AccountsSuspended, int AccountsExpired, int ExpiringIn30Days,
                                     int Seats, int ActiveSessions, int EstimatesToday, int Estimates7d, int LegalToday, int Legal7d,
                                     int AiCalls7d, int AiFailures7d)
    {
        public IReadOnlyList<DayDto> Days { get; init; } = [];
    }

    public sealed record PlanDto(int Id, string Code, string Name, string Role, int Seats, int DailyEstimateLimit, int DurationDays, decimal? PriceSar);

    public sealed record AccountDto(Guid Id, string Name, string Role, int? PlanId, string? PlanName, int SeatsTotal, int SeatsUsed,
                                    string Status, DateOnly StartsAt, DateOnly ExpiresAt, DateTime CreatedAt, string? OwnerPhone,
                                    DateTime? LastSeenAt, int Estimates30d, int Legal30d, string? Notes);
    public sealed record SeatDto(Guid Id, string Phone, string? DisplayName, bool IsOwner, string Status, DateTime CreatedAt,
                                 DateTime? LastSeenAt, bool Online, string? Ip, string? UserAgent, int Estimates30d, int Legal30d);
    public sealed record AccountDetailDto(AccountDto Account, IReadOnlyList<SeatDto> Seats);

    public sealed record CreateAccount(string Name, int PlanId, int? SeatsTotal, DateOnly? ExpiresAt, string OwnerPhone, string? OwnerName, string? Notes);
    public sealed record UpdateAccount(string Name, int PlanId, int SeatsTotal, string Status, DateOnly ExpiresAt, string? Notes);
    public sealed record AddSeat(string Phone, string? DisplayName);
    public sealed record UpdateSeat(string Phone, string? DisplayName, string Status);

    public sealed record LegalQuestionDto(Guid Id, DateTime CreatedAt, string Question, string Answer, string Provider, int Cited,
                                          int? DurationMs, string? Phone, string? AccountName, string? Search);

    // status: identity.v_account_status (019) — past its end date counts as expired even while the row still says active
    private const string AccountSql = $"""
        select a.id, a.name, a.role, a.plan_id, p.name as plan_name, a.seats_total,
               (select count(*) from identity.seats s where s.account_id = a.id)::int as seats_used,
               st.status, a.starts_at, a.expires_at, a.created_at,
               (select s.phone from identity.seats s where s.account_id = a.id and s.is_owner order by s.created_at limit 1) as owner_phone,
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
        select s.id, s.phone, s.display_name, s.is_owner, s.status, s.created_at,
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

        // ---- overview ----------------------------------------------------------------------------
        g.MapGet("/overview", async (Db db, CancellationToken ct) =>
        {
            var o = await db.SingleOrDefaultAsync<OverviewDto>($"""
                select
                  (select count(*) from identity.v_account_status where status = '{AccountStatuses.Active}')::int as accounts_active,
                  (select count(*) from identity.v_account_status where status = '{AccountStatuses.Suspended}')::int as accounts_suspended,
                  (select count(*) from identity.v_account_status where status = '{AccountStatuses.Expired}')::int as accounts_expired,
                  (select count(*) from identity.accounts a join identity.v_account_status st on st.account_id = a.id
                    where st.status = '{AccountStatuses.Active}' and a.expires_at < current_date + 30)::int as expiring_in30_days,
                  (select count(*) from identity.seats)::int as seats,
                  (select count(*) from identity.sessions where principal_kind = '{PrincipalKinds.Seat}' and revoked_at is null and expires_at > now())::int as active_sessions,
                  (select count(*) from app.valuations where created_at >= current_date)::int as estimates_today,
                  (select count(*) from app.valuations where created_at > now() - interval '7 days')::int as estimates7d,
                  (select count(*) from app.legal_questions where created_at >= current_date)::int as legal_today,
                  (select count(*) from app.legal_questions where created_at > now() - interval '7 days')::int as legal7d,
                  (select count(*) from ops.ai_calls where created_at > now() - interval '7 days')::int as ai_calls7d,
                  (select count(*) from ops.ai_calls where created_at > now() - interval '7 days' and not ok)::int as ai_failures7d
                """, null, ct);
            var days = await db.QueryAsync<DayDto>("""
                select d::date as day,
                       (select count(*) from app.valuations v where v.created_at >= d and v.created_at < d + interval '1 day')::int as estimates,
                       (select count(*) from app.legal_questions q where q.created_at >= d and q.created_at < d + interval '1 day')::int as legal
                from generate_series(current_date - 13, current_date, interval '1 day') d order by d
                """, null, ct);
            return Results.Ok(o! with { Days = days });
        }).WithSummary("نظرة عامة: الاشتراكات والاستخدام آخر 14 يوماً");

        g.MapGet("/plans", (Db db, CancellationToken ct) =>
            db.QueryAsync<PlanDto>("select id, code, name, role, seats, daily_estimate_limit, duration_days, price_sar from identity.plans_catalog order by id", null, ct))
         .WithSummary("الباقات");

        // ---- accounts ------------------------------------------------------------------------------
        g.MapGet("/accounts", (string? q, Db db, CancellationToken ct) =>
        {
            q = string.IsNullOrWhiteSpace(q) ? null : q.Trim();
            return db.QueryAsync<AccountDto>(AccountSql + """
                 where @q::text is null or a.name ilike '%' || @q || '%'
                    or exists (select 1 from identity.seats s where s.account_id = a.id and replace(s.phone, '+966', '0') like '%' || @q || '%')
                 order by a.created_at desc limit 500
                """, new { q }, ct);
        }).WithSummary("الحسابات (بحث بالاسم أو رقم الجوال)");

        g.MapGet("/accounts/{id:guid}", async (Guid id, Db db, CancellationToken ct) =>
        {
            var a = await db.SingleOrDefaultAsync<AccountDto>(AccountSql + " where a.id = @id", new { id }, ct);
            if (a is null) return Results.NotFound();
            var seats = await db.QueryAsync<SeatDto>(SeatSql + " where s.account_id = @id order by s.is_owner desc, s.created_at", new { id }, ct);
            return Results.Ok(new AccountDetailDto(a, seats));
        }).WithSummary("حساب ومقاعده");

        g.MapPost("/accounts", async (CreateAccount body, HttpContext http, Db db, CancellationToken ct) =>
        {
            var name = body.Name?.Trim() ?? "";
            if (name.Length is < 2 or > 120) return Invalid("name", "اكتب اسم الحساب");
            if (!PhoneNumber.TryNormalize(body.OwnerPhone, out var phone)) return Invalid("ownerPhone", "رقم جوال سعودي صحيح يبدأ بـ 05");
            var plan = await db.SingleOrDefaultAsync<PlanDto>(
                "select id, code, name, role, seats, daily_estimate_limit, duration_days, price_sar from identity.plans_catalog where id = @PlanId", new { body.PlanId }, ct);
            if (plan is null) return Invalid("planId", "اختر باقة");
            var seats = body.SeatsTotal ?? plan.Seats;
            if (seats is < 1 or > 100) return Invalid("seatsTotal", "عدد المقاعد بين 1 و100");
            var expires = body.ExpiresAt ?? DateOnly.FromDateTime(DateTime.Today).AddDays(plan.DurationDays);
            if (await PhoneTaken(db, phone, null, ct)) return Taken();

            var adminId = http.User.PrincipalId();
            try
            {
                var id = await db.InTransactionAsync(async tx =>
                {
                    var id = await tx.ScalarAsync<Guid>("""
                        with a as (
                          insert into identity.accounts (name, role, plan_id, seats_total, expires_at, notes)
                          values (@name, @role, @planId, @seats, @expires, @notes) returning id)
                        insert into identity.seats (account_id, phone, display_name, is_owner)
                        select id, @phone, @ownerName, true from a returning account_id
                        """, new { name, role = plan.Role, planId = plan.Id, seats, expires, notes = Clean(body.Notes), phone, ownerName = Clean(body.OwnerName) ?? name }, ct);
                    await Audit.WriteAsync(tx, PrincipalKinds.Admin, adminId, "admin.account.created", id.ToString(), http, new { name, plan = plan.Code, seats, expires, phone }, ct);
                    return id;
                }, ct);
                return Results.Ok(new { id });
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return Taken(); }
        }).WithSummary("حساب جديد مع مقعد المالك");

        g.MapPut("/accounts/{id:guid}", async (Guid id, UpdateAccount body, HttpContext http, Db db, CancellationToken ct) =>
        {
            var name = body.Name?.Trim() ?? "";
            if (name.Length is < 2 or > 120) return Invalid("name", "اكتب اسم الحساب");
            if (body.Status is not (AccountStatuses.Active or AccountStatuses.Suspended)) return Invalid("status", "الحالة: فعّال أو موقوف");
            if (body.SeatsTotal is < 1 or > 100) return Invalid("seatsTotal", "عدد المقاعد بين 1 و100");

            var adminId = http.User.PrincipalId();
            return await db.InTransactionAsync(async tx =>
            {
                // the account row lock keeps a seat from being added between this count and the update
                if (!await LockAccount(tx, id, ct)) return Results.NotFound();
                var used = await tx.ScalarAsync<int>("select count(*)::int from identity.seats where account_id = @id", new { id }, ct);
                if (body.SeatsTotal < used) return Invalid("seatsTotal", $"في الحساب {used} مقاعد، احذف مقعداً أولاً");

                var n = await tx.ExecuteAsync("""
                    update identity.accounts a set name = @name, plan_id = p.id, role = p.role, seats_total = @SeatsTotal,
                           status = @Status, expires_at = @ExpiresAt, notes = @notes
                    from identity.plans_catalog p where a.id = @id and p.id = @PlanId
                    """, new { id, name, body.PlanId, body.SeatsTotal, body.Status, body.ExpiresAt, notes = Clean(body.Notes) }, ct);
                if (n == 0) return Results.NotFound();
                if (body.Status == AccountStatuses.Suspended) await RevokeAccount(tx, id, ct);
                await Audit.WriteAsync(tx, PrincipalKinds.Admin, adminId, "admin.account.updated", id.ToString(), http, body, ct);
                return Results.NoContent();
            }, ct);
        }).WithSummary("تعديل الحساب: الباقة، المقاعد، الانتهاء، الإيقاف");

        // ---- seats ---------------------------------------------------------------------------------
        g.MapPost("/accounts/{id:guid}/seats", async (Guid id, AddSeat body, HttpContext http, Db db, CancellationToken ct) =>
        {
            if (!PhoneNumber.TryNormalize(body.Phone, out var phone)) return Invalid("phone", "رقم جوال سعودي صحيح يبدأ بـ 05");
            if (await PhoneTaken(db, phone, null, ct)) return Taken();
            try
            {
                return await db.InTransactionAsync(async tx =>
                {
                    // the account row lock makes two parallel adds count one after the other, so the seat limit holds
                    if (!await LockAccount(tx, id, ct)) return Results.NotFound();
                    var room = await tx.SingleOrDefaultAsync<(int Total, int Used)>(
                        "select seats_total, (select count(*)::int from identity.seats where account_id = @id) from identity.accounts where id = @id", new { id }, ct);
                    if (room.Used >= room.Total) return Invalid("phone", $"كل المقاعد مستخدمة ({room.Total})، زد عدد المقاعد في الحساب أولاً");
                    var seatId = await tx.ScalarAsync<Guid>(
                        "insert into identity.seats (account_id, phone, display_name) values (@id, @phone, @name) returning id",
                        new { id, phone, name = Clean(body.DisplayName) }, ct);
                    await Audit.WriteAsync(tx, PrincipalKinds.Admin, http.User.PrincipalId(), "admin.seat.added", seatId.ToString(), http, new { account = id, phone }, ct);
                    return Results.Ok(new { id = seatId });
                }, ct);
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return Taken(); }
        }).WithSummary("إضافة مقعد");

        g.MapPut("/seats/{id:guid}", async (Guid id, UpdateSeat body, HttpContext http, Db db, CancellationToken ct) =>
        {
            if (!PhoneNumber.TryNormalize(body.Phone, out var phone)) return Invalid("phone", "رقم جوال سعودي صحيح يبدأ بـ 05");
            if (body.Status is not (SeatStatuses.Active or SeatStatuses.Disabled)) return Invalid("status", "الحالة: فعّال أو معطّل");
            var old = await db.SingleOrDefaultAsync<(string Phone, string Status)>("select phone, status from identity.seats where id = @id", new { id }, ct);
            if (old == default) return Results.NotFound();
            if (phone != old.Phone && await PhoneTaken(db, phone, id, ct)) return Taken();
            try
            {
                await db.InTransactionAsync(async tx =>
                {
                    await tx.ExecuteAsync("update identity.seats set phone = @phone, display_name = @name, status = @Status where id = @id",
                        new { id, phone, name = Clean(body.DisplayName), body.Status }, ct);
                    // a new number or a disabled seat must not keep the old device signed in
                    if (phone != old.Phone || body.Status == SeatStatuses.Disabled) await RevokeSeat(tx, id, ct);
                    await Audit.WriteAsync(tx, PrincipalKinds.Admin, http.User.PrincipalId(), phone != old.Phone ? "admin.seat.phone_changed" : "admin.seat.updated",
                        id.ToString(), http, new { from = old.Phone, to = phone, body.Status }, ct);
                    return 0;
                }, ct);
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return Taken(); }
            return Results.NoContent();
        }).WithSummary("تعديل مقعد: نقل الاشتراك لرقم آخر، الاسم، التعطيل");

        g.MapDelete("/seats/{id:guid}", (Guid id, HttpContext http, Db db, CancellationToken ct) =>
            db.InTransactionAsync(async tx =>
            {
                var seat = await tx.SingleOrDefaultAsync<(string Phone, bool IsOwner)>("select phone, is_owner from identity.seats where id = @id for update", new { id }, ct);
                if (seat == default) return Results.NotFound();
                if (seat.IsOwner) return Results.Problem(title: "لا يُحذف مقعد المالك، انقل الاشتراك لرقم آخر بدلاً من ذلك", statusCode: 409, type: "owner_seat");
                await RevokeSeat(tx, id, ct);
                await tx.ExecuteAsync("delete from identity.seats where id = @id", new { id }, ct);
                await Audit.WriteAsync(tx, PrincipalKinds.Admin, http.User.PrincipalId(), "admin.seat.deleted", id.ToString(), http, new { seat.Phone }, ct);
                return Results.NoContent();
            }, ct))
         .WithSummary("حذف مقعد (غير المالك)");

        g.MapPost("/seats/{id:guid}/signout", (Guid id, HttpContext http, Db db, CancellationToken ct) =>
            db.InTransactionAsync(async tx =>
            {
                var n = await RevokeSeat(tx, id, ct);
                await Audit.WriteAsync(tx, PrincipalKinds.Admin, http.User.PrincipalId(), "admin.seat.signed_out", id.ToString(), http, new { sessions = n }, ct);
                return Results.Ok(new { sessions = n });
            }, ct))
         .WithSummary("تسجيل خروج المقعد من جهازه الحالي");

        // ---- logs ----------------------------------------------------------------------------------
        g.MapGet("/legal-questions", (int? limit, Db db, CancellationToken ct) =>
            db.QueryAsync<LegalQuestionDto>("""
                select q.id, q.created_at, q.question, q.answer, q.provider, cardinality(q.cited) as cited, q.duration_ms,
                       replace(s.phone, '+966', '0') as phone, a.name as account_name, q.search
                from app.legal_questions q
                left join identity.seats s on s.id = q.seat_id left join identity.accounts a on a.id = s.account_id
                order by q.created_at desc limit @limit
                """, new { limit = Math.Clamp(limit ?? 100, 1, 500) }, ct))
         .WithSummary("أسئلة المساعد القانوني، لمراجعة الجودة");
    }

    // ---- helpers -----------------------------------------------------------------------------------
    private static IResult Taken() =>
        Results.Problem(title: "هذا الرقم مسجل في اشتراك آخر", statusCode: 409, type: "phone_taken");

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static Task<bool> PhoneTaken(Db db, string phone, Guid? exceptSeat, CancellationToken ct) =>
        db.ScalarAsync<bool>("""
            select exists (select 1 from identity.seats where phone = @phone and id is distinct from @exceptSeat)
                or exists (select 1 from identity.admins where phone = @phone)
            """, new { phone, exceptSeat }, ct);

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
