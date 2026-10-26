using Ejadah.Ai.Api.Auth;
using Ejadah.Ai.Api.Infrastructure;
using Npgsql;

namespace Ejadah.Ai.Api.Admin;

/// <summary>
/// Admin panel (PLAN.md phase F): overview, accounts and their seats, sign-outs, and the logs (legal questions, AI calls, audit).
/// Moving a subscription to another phone is a seat phone change here; there is no self-service.
/// Suspending, disabling or re-numbering revokes the sessions at once; an access token already issued lives out its 15 minutes.
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
                                          int? DurationMs, string? Phone, string? AccountName);
    public sealed record AiCallDto(long Id, DateTime CreatedAt, string Feature, string Provider, string? Model, bool Ok, int? DurationMs,
                                   int? InputTokens, int? OutputTokens, string? Error, string? Phone);
    public sealed record AuditDto(long Id, DateTime At, string? ActorKind, string? Actor, string Action, string? Subject, string? Data, string? Ip);

    // an account past its end date counts as expired even while its row still says active
    private const string Status = "case when a.status = 'active' and a.expires_at < current_date then 'expired' else a.status end";

    private const string AccountSql = $"""
        select a.id, a.name, a.role, a.plan_id, p.name as plan_name, a.seats_total,
               (select count(*) from identity.seats s where s.account_id = a.id)::int as seats_used,
               {Status} as status, a.starts_at, a.expires_at, a.created_at,
               (select s.phone from identity.seats s where s.account_id = a.id and s.is_owner order by s.created_at limit 1) as owner_phone,
               (select max(se.last_seen_at) from identity.sessions se join identity.seats s on s.id = se.principal_id
                 where se.principal_kind = 'seat' and s.account_id = a.id) as last_seen_at,
               (select count(*) from app.valuations v where v.account_id = a.id and v.created_at > now() - interval '30 days')::int as estimates_30d,
               (select count(*) from app.legal_questions q join identity.seats s on s.id = q.seat_id
                 where s.account_id = a.id and q.created_at > now() - interval '30 days')::int as legal_30d,
               a.notes
        from identity.accounts a left join identity.plans_catalog p on p.id = a.plan_id
        """;

    private const string SeatSql = """
        select s.id, s.phone, s.display_name, s.is_owner, s.status, s.created_at,
               last.last_seen_at, coalesce(last.online, false) as online, last.ip, last.user_agent,
               (select count(*) from app.valuations v where v.seat_id = s.id and v.created_at > now() - interval '30 days')::int as estimates_30d,
               (select count(*) from app.legal_questions q where q.seat_id = s.id and q.created_at > now() - interval '30 days')::int as legal_30d
        from identity.seats s
        left join lateral (
          select se.last_seen_at, se.revoked_at is null and se.expires_at > now() as online, se.ip, se.user_agent
          from identity.sessions se where se.principal_kind = 'seat' and se.principal_id = s.id
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
                  (select count(*) from identity.accounts a where {Status} = 'active')::int as accounts_active,
                  (select count(*) from identity.accounts a where {Status} = 'suspended')::int as accounts_suspended,
                  (select count(*) from identity.accounts a where {Status} = 'expired')::int as accounts_expired,
                  (select count(*) from identity.accounts a where {Status} = 'active' and a.expires_at < current_date + 30)::int as expiring_in30_days,
                  (select count(*) from identity.seats)::int as seats,
                  (select count(*) from identity.sessions where principal_kind = 'seat' and revoked_at is null and expires_at > now())::int as active_sessions,
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
                var id = await db.ScalarAsync<Guid>("""
                    with a as (
                      insert into identity.accounts (name, role, plan_id, seats_total, expires_at, notes)
                      values (@name, @role, @planId, @seats, @expires, @notes) returning id)
                    insert into identity.seats (account_id, phone, display_name, is_owner)
                    select id, @phone, @ownerName, true from a returning account_id
                    """, new { name, role = plan.Role, planId = plan.Id, seats, expires, notes = Clean(body.Notes), phone, ownerName = Clean(body.OwnerName) ?? name }, ct);
                await AuthEndpoints.Audit(db, "admin", adminId, "admin.account.created", id.ToString(), http, new { name, plan = plan.Code, seats, expires, phone }, ct);
                return Results.Ok(new { id });
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return Taken(); }
        }).WithSummary("حساب جديد مع مقعد المالك");

        g.MapPut("/accounts/{id:guid}", async (Guid id, UpdateAccount body, HttpContext http, Db db, CancellationToken ct) =>
        {
            var name = body.Name?.Trim() ?? "";
            if (name.Length is < 2 or > 120) return Invalid("name", "اكتب اسم الحساب");
            if (body.Status is not ("active" or "suspended")) return Invalid("status", "الحالة: فعّال أو موقوف");
            if (body.SeatsTotal is < 1 or > 100) return Invalid("seatsTotal", "عدد المقاعد بين 1 و100");
            var used = await db.ScalarAsync<int>("select count(*)::int from identity.seats where account_id = @id", new { id }, ct);
            if (body.SeatsTotal < used) return Invalid("seatsTotal", $"في الحساب {used} مقاعد، احذف مقعداً أولاً");

            var adminId = http.User.PrincipalId();
            var n = await db.ExecuteAsync("""
                update identity.accounts a set name = @name, plan_id = p.id, role = p.role, seats_total = @SeatsTotal,
                       status = @Status, expires_at = @ExpiresAt, notes = @notes
                from identity.plans_catalog p where a.id = @id and p.id = @PlanId
                """, new { id, name, body.PlanId, body.SeatsTotal, body.Status, body.ExpiresAt, notes = Clean(body.Notes) }, ct);
            if (n == 0) return Results.NotFound();
            if (body.Status == "suspended")
                await RevokeSessions(db, "select id from identity.seats where account_id = @id", new { id }, ct);
            await AuthEndpoints.Audit(db, "admin", adminId, "admin.account.updated", id.ToString(), http, body, ct);
            return Results.NoContent();
        }).WithSummary("تعديل الحساب: الباقة، المقاعد، الانتهاء، الإيقاف");

        // ---- seats ---------------------------------------------------------------------------------
        g.MapPost("/accounts/{id:guid}/seats", async (Guid id, AddSeat body, HttpContext http, Db db, CancellationToken ct) =>
        {
            if (!PhoneNumber.TryNormalize(body.Phone, out var phone)) return Invalid("phone", "رقم جوال سعودي صحيح يبدأ بـ 05");
            var room = await db.SingleOrDefaultAsync<(int Total, int Used)>(
                "select seats_total, (select count(*)::int from identity.seats where account_id = @id) from identity.accounts where id = @id", new { id }, ct);
            if (room == default) return Results.NotFound();
            if (room.Used >= room.Total) return Invalid("phone", $"كل المقاعد مستخدمة ({room.Total})، زد عدد المقاعد في الحساب أولاً");
            if (await PhoneTaken(db, phone, null, ct)) return Taken();
            try
            {
                var seatId = await db.ScalarAsync<Guid>(
                    "insert into identity.seats (account_id, phone, display_name) values (@id, @phone, @name) returning id",
                    new { id, phone, name = Clean(body.DisplayName) }, ct);
                await AuthEndpoints.Audit(db, "admin", http.User.PrincipalId(), "admin.seat.added", seatId.ToString(), http, new { account = id, phone }, ct);
                return Results.Ok(new { id = seatId });
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return Taken(); }
        }).WithSummary("إضافة مقعد");

        g.MapPut("/seats/{id:guid}", async (Guid id, UpdateSeat body, HttpContext http, Db db, CancellationToken ct) =>
        {
            if (!PhoneNumber.TryNormalize(body.Phone, out var phone)) return Invalid("phone", "رقم جوال سعودي صحيح يبدأ بـ 05");
            if (body.Status is not ("active" or "disabled")) return Invalid("status", "الحالة: فعّال أو معطّل");
            var old = await db.SingleOrDefaultAsync<(string Phone, string Status)>("select phone, status from identity.seats where id = @id", new { id }, ct);
            if (old == default) return Results.NotFound();
            if (phone != old.Phone && await PhoneTaken(db, phone, id, ct)) return Taken();
            try
            {
                await db.ExecuteAsync("update identity.seats set phone = @phone, display_name = @name, status = @Status where id = @id",
                    new { id, phone, name = Clean(body.DisplayName), body.Status }, ct);
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return Taken(); }
            // a new number or a disabled seat must not keep the old device signed in
            if (phone != old.Phone || body.Status == "disabled")
                await RevokeSessions(db, "select @id", new { id }, ct);
            await AuthEndpoints.Audit(db, "admin", http.User.PrincipalId(), phone != old.Phone ? "admin.seat.phone_changed" : "admin.seat.updated",
                id.ToString(), http, new { from = old.Phone, to = phone, body.Status }, ct);
            return Results.NoContent();
        }).WithSummary("تعديل مقعد: نقل الاشتراك لرقم آخر، الاسم، التعطيل");

        g.MapDelete("/seats/{id:guid}", async (Guid id, HttpContext http, Db db, CancellationToken ct) =>
        {
            var seat = await db.SingleOrDefaultAsync<(string Phone, bool IsOwner)>("select phone, is_owner from identity.seats where id = @id", new { id }, ct);
            if (seat == default) return Results.NotFound();
            if (seat.IsOwner) return Results.Problem(title: "لا يُحذف مقعد المالك، انقل الاشتراك لرقم آخر بدلاً من ذلك", statusCode: 409, type: "owner_seat");
            await RevokeSessions(db, "select @id", new { id }, ct);
            await db.ExecuteAsync("delete from identity.seats where id = @id", new { id }, ct);
            await AuthEndpoints.Audit(db, "admin", http.User.PrincipalId(), "admin.seat.deleted", id.ToString(), http, new { seat.Phone }, ct);
            return Results.NoContent();
        }).WithSummary("حذف مقعد (غير المالك)");

        g.MapPost("/seats/{id:guid}/signout", async (Guid id, HttpContext http, Db db, CancellationToken ct) =>
        {
            var n = await RevokeSessions(db, "select @id", new { id }, ct);
            await AuthEndpoints.Audit(db, "admin", http.User.PrincipalId(), "admin.seat.signed_out", id.ToString(), http, new { sessions = n }, ct);
            return Results.Ok(new { sessions = n });
        }).WithSummary("تسجيل خروج المقعد من جهازه الحالي");

        // ---- logs ----------------------------------------------------------------------------------
        g.MapGet("/legal-questions", (int? limit, Db db, CancellationToken ct) =>
            db.QueryAsync<LegalQuestionDto>("""
                select q.id, q.created_at, q.question, q.answer, q.provider, cardinality(q.cited) as cited, q.duration_ms,
                       replace(s.phone, '+966', '0') as phone, a.name as account_name
                from app.legal_questions q
                left join identity.seats s on s.id = q.seat_id left join identity.accounts a on a.id = s.account_id
                order by q.created_at desc limit @limit
                """, new { limit = Math.Clamp(limit ?? 100, 1, 500) }, ct))
         .WithSummary("أسئلة المساعد القانوني، لمراجعة الجودة");

        g.MapGet("/ai-calls", (int? limit, Db db, CancellationToken ct) =>
            db.QueryAsync<AiCallDto>("""
                select c.id, c.created_at, c.feature, c.provider, c.model, c.ok, c.duration_ms, c.input_tokens, c.output_tokens, c.error,
                       replace(s.phone, '+966', '0') as phone
                from ops.ai_calls c left join identity.seats s on s.id = c.seat_id
                order by c.created_at desc limit @limit
                """, new { limit = Math.Clamp(limit ?? 100, 1, 500) }, ct))
         .WithSummary("سجل استدعاءات الذكاء الاصطناعي");

        g.MapGet("/audit", (int? limit, string? action, Db db, CancellationToken ct) =>
            db.QueryAsync<AuditDto>("""
                select l.id, l.at, l.actor_kind,
                       coalesce(ad.name, replace(s.phone, '+966', '0')) as actor,
                       l.action, l.subject, l.data::text as data, l.ip
                from ops.audit_log l
                left join identity.seats s on l.actor_kind = 'seat' and s.id = l.actor_id
                left join identity.admins ad on l.actor_kind = 'admin' and ad.id = l.actor_id
                where @action::text is null or l.action like @action || '%'
                order by l.at desc limit @limit
                """, new { limit = Math.Clamp(limit ?? 200, 1, 1000), action = string.IsNullOrWhiteSpace(action) ? null : action.Trim() }, ct))
         .WithSummary("سجل التدقيق");
    }

    // ---- helpers -----------------------------------------------------------------------------------
    private static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    private static IResult Taken() =>
        Results.Problem(title: "هذا الرقم مسجل في اشتراك آخر", statusCode: 409, type: "phone_taken");

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static Task<bool> PhoneTaken(Db db, string phone, Guid? exceptSeat, CancellationToken ct) =>
        db.ScalarAsync<bool>("""
            select exists (select 1 from identity.seats where phone = @phone and id is distinct from @exceptSeat)
                or exists (select 1 from identity.admins where phone = @phone)
            """, new { phone, exceptSeat }, ct);

    /// <summary>Revokes the live sessions of the seats the given query selects (reason 'admin'); returns how many.</summary>
    private static Task<int> RevokeSessions(Db db, string seatIdsSql, object args, CancellationToken ct) =>
        db.ExecuteAsync($"""
            update identity.sessions set revoked_at = now(), revoked_reason = 'admin'
            where principal_kind = 'seat' and revoked_at is null and principal_id in ({seatIdsSql})
            """, args, ct);
}
