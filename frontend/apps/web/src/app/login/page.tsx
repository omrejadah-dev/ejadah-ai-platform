"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
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

const fmtPhone = (d: string) => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean).join(" ");

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [digits, setDigits] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(0);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const ready = digits.length === 9 && digits.startsWith("5");
  const reason = params.get("reason");
  const returnTo = safeReturnPath(params.get("from"));

  // already signed in (or the access cookie only expired and the refresh cookie still works)? go straight back
  useEffect(() => {
    api<Me>("/api/auth/me", { redirectOn401: false }).then(() => router.replace(returnTo)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ticking = resendLeft > 0;
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setResendLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ devCode: string | null }>("/api/auth/otp", { method: "POST", json: { phone: digits } });
      setDevCode(r.devCode);
      setOtp(["", "", "", "", "", ""]);
      setStep("otp");
      setResendLeft(30);
      setTimeout(() => boxes.current[0]?.focus(), 60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  async function verify(code: string) {
    setError(null);
    setLoading(true);
    try {
      await api<Me>("/api/auth/verify", { method: "POST", json: { phone: digits, code } });
      router.replace(returnTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
      setOtp(["", "", "", "", "", ""]);
      boxes.current[0]?.focus();
      setLoading(false);
    }
  }

  function typeOtp(i: number, raw: string) {
    const d = raw.replace(/\D/g, "");
    if (d.length > 1) {
      const all = d.slice(0, 6).split("");
      setOtp([...all, ...Array(6 - all.length).fill("")]);
      if (all.length === 6) void verify(all.join(""));
      else boxes.current[all.length]?.focus();
      return;
    }
    const next = [...otp];
    next[i] = d;
    setOtp(next);
    if (d && i < 5) boxes.current[i + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
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
            {step === "phone" ? (
              <div key="phone" className="animate-[login-rise_0.35s_ease]">
                <h2 className="text-[22px] font-extrabold text-heading">تسجيل الدخول</h2>
                <p className="mb-6 mt-1 text-sm leading-relaxed text-text-2">أدخل رقم الجوال المرتبط باشتراكك، وسنرسل لك رمز تحقق.</p>
                {reason && REASON_TEXT[reason] && !error ? <Message tone="info">{REASON_TEXT[reason]}</Message> : null}
                {error ? <Message tone="danger">{error}</Message> : null}
                <form onSubmit={sendCode}>
                  <label htmlFor="mobile" className="mb-2 block text-[13px] font-bold text-text-2">رقم الجوال</label>
                  <div className="relative mb-5" dir="ltr">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 border-r border-border-md px-3.5 text-sm font-bold text-text-2">
                      +966
                    </span>
                    <input id="mobile" type="tel" inputMode="numeric" autoComplete="tel" placeholder="5X XXX XXXX" autoFocus dir="ltr"
                      value={fmtPhone(digits)}
                      onChange={(e) => { setError(null); setDigits(e.target.value.replace(/\D/g, "").replace(/^0/, "").slice(0, 9)); }}
                      className={cn(input, "pl-[78px] text-left tracking-[0.04em]", error && inputBad)} />
                  </div>
                  <button type="submit" className={primary} disabled={loading || !ready}>
                    {loading ? "جارٍ الإرسال…" : "إرسال رمز التحقق"}
                    {!loading ? <i className="ti ti-arrow-left text-lg" aria-hidden /> : null}
                  </button>
                </form>
              </div>
            ) : (
              <div key="otp" className="animate-[login-rise_0.35s_ease]">
                <button type="button" onClick={() => { setStep("phone"); setError(null); }}
                  className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gold-d hover:text-heading">
                  <i className="ti ti-arrow-right" aria-hidden /> تغيير الرقم
                </button>
                <h2 className="text-[22px] font-extrabold text-heading">أدخل رمز التحقق</h2>
                <p className="mb-6 mt-1 text-sm leading-relaxed text-text-2">
                  أرسلنا 6 أرقام إلى <b dir="ltr" className="text-text">+966 {fmtPhone(digits)}</b>
                </p>
                {devCode ? <Message tone="info">{`وضع التطوير: الرمز ${devCode}`}</Message> : null}
                {error ? <Message tone="danger">{error}</Message> : null}
                <div className="mb-5 grid grid-cols-6 gap-2" dir="ltr">
                  {otp.map((v, i) => (
                    <input key={i} ref={(el) => { boxes.current[i] = el; }} inputMode="numeric" maxLength={6} value={v} aria-label={`الرقم ${i + 1}`}
                      onChange={(e) => typeOtp(i, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Backspace" && !otp[i] && i > 0) boxes.current[i - 1]?.focus(); }}
                      className={cn(input, "h-[58px] px-0 text-center text-[24px] font-extrabold", v && "border-ink bg-surface", error && inputBad)} />
                  ))}
                </div>
                <button type="button" className={primary} disabled={loading || otp.some((x) => !x)} onClick={() => verify(otp.join(""))}>
                  {loading ? "جارٍ التحقق…" : "دخول"}
                </button>
                <div className="mt-5 text-center text-[13px] text-text-2">
                  {resendLeft > 0 ? (
                    <span>إعادة الإرسال بعد <b dir="ltr">{resendLeft}</b> ث</span>
                  ) : (
                    <button type="button" className="font-bold text-gold-d hover:text-heading disabled:opacity-50" disabled={loading} onClick={() => sendCode()}>إعادة إرسال الرمز</button>
                  )}
                </div>
              </div>
            )}
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
