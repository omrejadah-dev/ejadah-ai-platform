"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@platform/ui-kit";
import { EjadaLogo } from "@/components/EjadaLogo";
import { api, ApiError, type Me } from "@/lib/api";

const fieldInput =
  "w-full rounded-[11px] border border-[#ddd8cc] bg-surface-2 px-[15px] py-[13px] text-[15px] text-text outline-none transition-[border-color,box-shadow,background] duration-150 placeholder:tracking-[0.02em] placeholder:text-text-3 focus:border-gold focus:bg-surface focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--gold)_16%,transparent)]";
const fieldInputBad = "border-danger shadow-[0_0_0_4px_color-mix(in_srgb,var(--red)_12%,transparent)]";
const primaryBtn =
  "flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-[11px] border-0 bg-ink py-3.5 text-[15.5px] font-bold text-white shadow-[0_12px_26px_-14px_rgba(16,43,78,.7)] transition-[background,transform,box-shadow] duration-150 hover:enabled:-translate-y-px hover:enabled:bg-navy-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
const linkSm = "cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-gold-d hover:text-heading disabled:cursor-not-allowed disabled:opacity-45";
const stepTag = "mb-4 inline-flex items-center gap-[7px] rounded-full bg-gold-soft px-3 py-[5px] text-xs font-bold text-gold-d";
const stepAnim = "animate-[login-rise_0.35s_ease]";

const REASON_TEXT: Record<string, string> = {
  session_replaced: "تم تسجيل الدخول من جهاز آخر، فأُنهيت الجلسة هنا.",
  session_expired: "انتهت الجلسة، سجّل الدخول من جديد.",
  expired: "انتهت الجلسة، سجّل الدخول من جديد.",
  no_session: "سجّل الدخول للمتابعة.",
};

function Alert({ children, tone = "danger" }: { children: string; tone?: "danger" | "info" }) {
  const cls = tone === "danger" ? "border-e-danger bg-danger-bg text-danger-text" : "border-e-gold bg-gold-soft text-gold-d";
  return (
    <div className={cn("mb-[18px] flex items-start gap-[9px] rounded-[11px] border-e-[3px] px-3.5 py-[11px] text-[13px] font-semibold leading-relaxed", cls)} role="alert">
      <span>{children}</span>
    </div>
  );
}

function formatPhoneDisplay(d: string) {
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean).join(" ");
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = phone.replace(/\D/g, "");
  const ready = digits.length === 9 && digits.startsWith("5");
  const reason = params.get("reason");

  useEffect(() => {
    api<Me>("/api/auth/me", { retry: false }).then(() => router.replace(params.get("from") ?? "/")).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendLeft <= 0) return;
    const id = window.setInterval(() => setResendLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => window.clearInterval(id);
  }, [resendLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ sentTo: string; devCode: string | null }>("/api/auth/otp", { method: "POST", json: { phone: digits } });
      setDevCode(r.devCode);
      setOtp(["", "", "", "", "", ""]);
      setStep("otp");
      setResendLeft(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
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
      router.replace(params.get("from") ?? "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  function onOtpChange(i: number, v: string) {
    const d = v.replace(/\D/g, "");
    if (d.length > 1) {
      const next = d.slice(0, 6).split("");
      const filled = [...next, ...Array(6 - next.length).fill("")];
      setOtp(filled);
      if (next.length === 6) void verify(next.join(""));
      else otpRefs.current[next.length]?.focus();
      return;
    }
    const next = [...otp];
    next[i] = d;
    setOtp(next);
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.every((x) => x) ) void verify(next.join(""));
  }

  return (
    <div className="grid min-h-svh grid-cols-1 min-[900px]:grid-cols-[0.92fr_1.08fr]">
      <aside className="relative hidden flex-col overflow-hidden bg-ink px-[54px] py-14 text-white min-[900px]:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_82%_8%,rgba(164,144,111,.20),transparent_55%),radial-gradient(90%_80%_at_10%_100%,rgba(34,64,110,.55),transparent_60%)]" aria-hidden />
        <EjadaLogo variant="onDark" className="relative h-auto w-[150px]" />
        <div className="relative mt-[34px] mb-5 h-[3px] w-[46px] rounded-full bg-gold-2" />
        <div className="relative max-w-[16ch] text-[30px] font-extrabold leading-[1.5] tracking-[-0.01em]">
          سعر العقار من <span className="text-gold-2">صفقات حقيقية</span> لا من تخمين
        </div>
        <p className="relative mt-4 max-w-[36ch] text-[15px] leading-[1.9] text-white/72">
          4.6 مليون صفقة من وزارة العدل، تسعير بنطاق ودرجة ثقة، ونصائح تنفيذية، ومساعد قانوني من نصوص الأنظمة.
        </p>
        <div className="relative mt-auto flex items-center justify-between gap-3.5 pt-[30px] text-xs text-white/50">
          <span>© 2026 إجادة المهنية للتقييم العقاري</span>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-surface px-[26px] py-10">
        <div className="w-full max-w-[392px]">
          <EjadaLogo variant="onLight" className="mx-auto mb-[26px] hidden h-auto w-[150px] max-[899px]:block" />

          {step === "phone" ? (
            <section key="phone" className={stepAnim}>
              <h1 className="mb-1.5 text-2xl font-extrabold tracking-[-0.01em] text-heading">تسجيل الدخول</h1>
              <p className="mb-[26px] text-[15px] leading-[1.7] text-text-2">
                أدخل <b className="font-bold text-text">رقم الجوال</b> المرتبط باشتراكك لإرسال رمز التحقق.
              </p>
              {reason && REASON_TEXT[reason] && !error ? <Alert tone="info">{REASON_TEXT[reason]}</Alert> : null}
              {error ? <Alert>{error}</Alert> : null}
              <form onSubmit={sendCode}>
                <label htmlFor="mobile" className="mb-2 block text-[13px] font-bold text-text-2">رقم الجوال</label>
                <div className="relative mb-[22px] flex items-center" dir="ltr">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center border-r border-[#ddd8cc] px-[13px] text-sm font-bold tracking-[0.02em] text-text-2">+966</span>
                  <input
                    id="mobile" type="tel" inputMode="numeric" autoComplete="tel" placeholder="5X XXX XXXX" dir="ltr" autoFocus
                    value={formatPhoneDisplay(digits)}
                    onChange={(e) => { setError(null); setPhone(e.target.value.replace(/\D/g, "").replace(/^0/, "").slice(0, 9)); }}
                    className={cn(fieldInput, "pl-[72px] text-left", error && fieldInputBad)}
                  />
                </div>
                <button type="submit" className={primaryBtn} disabled={loading || !ready}>
                  {loading ? "جارٍ الإرسال…" : "إرسال الرمز"}
                </button>
              </form>
              <p className="mt-6 text-center text-xs leading-relaxed text-text-3">
                لا يوجد لديك اشتراك؟ تواصل مع إجادة لتفعيل حسابك.
              </p>
            </section>
          ) : (
            <section key="otp" className={stepAnim}>
              <span className={stepTag}>رمز التحقق</span>
              <h1 className="mb-1.5 text-2xl font-extrabold tracking-[-0.01em] text-heading">أدخل الرمز</h1>
              <p className="mb-[22px] text-[15px] leading-[1.7] text-text-2">
                أرسلنا رمزاً من 6 أرقام إلى <b dir="ltr" className="font-bold text-text">+966 {formatPhoneDisplay(digits)}</b>
              </p>
              {devCode ? <Alert tone="info">{`وضع التطوير: الرمز هو ${devCode}`}</Alert> : null}
              {error ? <Alert>{error}</Alert> : null}
              <div className="mb-[22px] flex justify-between gap-2" dir="ltr">
                {otp.map((v, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    inputMode="numeric" maxLength={6} value={v}
                    onChange={(e) => onOtpChange(i, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus(); }}
                    className={cn(fieldInput, "h-[54px] w-[48px] px-0 text-center text-[22px] font-extrabold", error && fieldInputBad)}
                    aria-label={`الرقم ${i + 1}`}
                  />
                ))}
              </div>
              <button type="button" className={primaryBtn} disabled={loading || otp.some((x) => !x)} onClick={() => verify(otp.join(""))}>
                {loading ? "جارٍ التحقق…" : "دخول"}
              </button>
              <div className="mt-5 flex items-center justify-between text-[13px]">
                <button type="button" className={linkSm} onClick={() => { setStep("phone"); setError(null); }}>تغيير الرقم</button>
                <button type="button" className={linkSm} disabled={resendLeft > 0 || loading} onClick={() => sendCode()}>
                  {resendLeft > 0 ? `إعادة الإرسال خلال ${resendLeft} ث` : "إعادة إرسال الرمز"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
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
