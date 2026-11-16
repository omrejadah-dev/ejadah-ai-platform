"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@platform/ui-kit";
import { api, ApiError, type Me } from "@/lib/api";
import { safeReturnPath } from "@/lib/routes";

const REASON_TEXT: Record<string, string> = {
  session_replaced: "تم تسجيل الدخول من جهاز آخر، فأُنهيت الجلسة هنا.",
  session_expired: "انتهت الجلسة، سجّل الدخول من جديد.",
  expired: "انتهت الجلسة، سجّل الدخول من جديد.",
  no_session: "سجّل الدخول للمتابعة.",
};


const input = "h-[52px] w-full rounded-xl border border-border-md bg-surface-2 px-4 text-[16px] text-text outline-none transition placeholder:text-text-3 focus:border-gold focus:bg-surface focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--gold)_18%,transparent)]";
const inputBad = "border-danger shadow-[0_0_0_4px_color-mix(in_srgb,var(--red)_12%,transparent)]";
const primary = "flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15.5px] font-bold text-white shadow-[0_14px_30px_-16px_rgba(16,43,78,.85)] transition hover:enabled:bg-navy-3 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";

function Message({ children, tone }: { children: string; tone: "danger" | "info" }) {
  return (
    <div role="alert" className={cn("mb-5 rounded-xl px-4 py-3 text-[13px] font-semibold leading-relaxed",
      tone === "danger" ? "bg-danger-bg text-danger-text" : "bg-gold-soft text-gold-d")}>
      {children}
    </div>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ready = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length > 0;
  const reason = params.get("reason");
  const returnTo = safeReturnPath(params.get("from"));

  // already signed in (or the access cookie only expired and the refresh cookie still works)? go straight back
  useEffect(() => {
    api<Me>("/api/auth/me", { redirectOn401: false }).then(() => router.replace(returnTo)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api<Me>("/api/auth/login", { method: "POST", json: { email: email.trim(), password } });
      router.replace(returnTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-ink text-white">
      {/* backdrop: light wash + the Kingdom (13 regions, districts in gold by land price) */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_78%_35%,rgba(200,181,145,.16),transparent_65%),radial-gradient(60%_70%_at_0%_100%,rgba(34,64,110,.7),transparent_70%)]" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/kingdom-map.svg" alt="" aria-hidden
        className="pointer-events-none absolute inset-0 m-auto hidden h-[94svh] w-auto max-w-[96vw] object-contain opacity-90 animate-[map-in_1.4s_ease-out_both] lg:block" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/kingdom-map.svg" alt="" aria-hidden
        className="pointer-events-none absolute left-1/2 top-[3svh] w-[125vw] max-w-none -translate-x-1/2 opacity-50 [mask-image:linear-gradient(to_bottom,black_60%,transparent)] lg:hidden" />

      <div className="relative flex min-h-svh items-center justify-center px-5 py-8">

        {/* card */}
        <section className="relative w-full max-w-[440px]">
          {/* logo removed until Ejadah sends the correct one (it goes back here, above the card) */}
          <div className="rounded-[22px] bg-surface p-7 text-text shadow-[0_40px_80px_-30px_rgba(0,0,0,.55)] sm:p-8">
            <div className="animate-[login-rise_0.35s_ease]">
              <h2 className="text-[22px] font-extrabold text-heading">تسجيل الدخول</h2>
              <p className="mb-6 mt-1 text-sm leading-relaxed text-text-2">أدخل البريد الإلكتروني وكلمة المرور المرتبطين باشتراكك.</p>
              {reason && REASON_TEXT[reason] && !error ? <Message tone="info">{REASON_TEXT[reason]}</Message> : null}
              {error ? <Message tone="danger">{error}</Message> : null}
              <form onSubmit={signIn}>
                <label htmlFor="email" className="mb-2 block text-[13px] font-bold text-text-2">البريد الإلكتروني</label>
                <input id="email" type="email" inputMode="email" autoComplete="username" placeholder="name@company.com" autoFocus dir="ltr"
                  value={email} onChange={(e) => { setError(null); setEmail(e.target.value); }}
                  className={cn(input, "mb-4 text-left", error && inputBad)} />
                <label htmlFor="password" className="mb-2 block text-[13px] font-bold text-text-2">كلمة المرور</label>
                <div className="relative mb-5" dir="ltr">
                  <input id="password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr"
                    value={password} onChange={(e) => { setError(null); setPassword(e.target.value); }}
                    className={cn(input, "pr-12 text-left", error && inputBad)} />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={show}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center text-text-3 hover:text-heading">
                    <i className={cn("ti text-lg", show ? "ti-eye-off" : "ti-eye")} aria-hidden />
                  </button>
                </div>
                <button type="submit" className={primary} disabled={loading || !ready}>
                  {loading ? "جارٍ الدخول…" : "دخول"}
                  {!loading ? <i className="ti ti-arrow-left text-lg" aria-hidden /> : null}
                </button>
              </form>
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-white/55">
            لا يوجد لديك اشتراك؟ تواصل مع إجادة لتفعيل حسابك.
          </p>
          <p className="mt-8 text-center text-[11px] text-white/35">© 2026 إجادة  للوساطه العقاريه</p>
        </section>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
