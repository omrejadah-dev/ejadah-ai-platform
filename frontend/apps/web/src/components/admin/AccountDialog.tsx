"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal, Badge, Button, FormGroup, Input, Note, Select, Textarea, useToast } from "@platform/ui-kit";
import { api, ApiError } from "@/lib/api";
import { addDays, daysUntil, deviceLabel, type AccountDetail, type Plan, type Seat } from "@/lib/admin";
import { dateOnly, dateTime } from "@/lib/format";
import { QueryView } from "@/components/QueryView";
import { AccountAvatar } from "@/components/admin/AccountBits";

/** What the form tells the dialog, so the «حفظ» in the footer saves it: something changed and is valid, a save running. */
type FormState = { ready: boolean; pending: boolean };
const FORM_ID = "account-form";

/** One account in a dialog over the accounts list (faded behind it): its subscription and its login (one per account:
 *  email, password, device) in one form, saved by the one «حفظ». */
export function AccountDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["admin", "account", id], queryFn: () => api<AccountDetail>(`/api/admin/accounts/${id}`) });
  const a = q.data?.account;
  const [form, setForm] = useState<FormState | null>(null);
  // each save starts the form over from the fresh account; refetches alone keep unsaved edits
  const [formRev, setFormRev] = useState(0);
  return (
    <AppModal open title={a?.name ?? "الحساب"} onClose={onClose} maxWidthPx={780}
      headerIcon={a ? <AccountAvatar account={a} className="size-11" /> : undefined}
      // the × closes; the footer only saves
      footer={a ? (
        <Button type="submit" form={FORM_ID} variant="primary" disabled={!form?.ready || form.pending} loading={form?.pending}>
          <i className="ti ti-device-floppy" aria-hidden /> حفظ
        </Button>
      ) : undefined}>
      <QueryView q={q} errorLine="تعذّر تحميل الحساب" className="py-16">
        {(detail) => <AccountForm key={`${detail.account.id}:${formRev}`} detail={detail} onForm={setForm} onSaved={() => setFormRev((r) => r + 1)} />}
      </QueryView>
    </AppModal>
  );
}

function AccountForm({ detail, onForm, onSaved }: { detail: AccountDetail; onForm: (s: FormState) => void; onSaved: () => void }) {
  const { account: a, login: s } = detail;
  const qc = useQueryClient();
  const { showToast } = useToast();
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: () => api<Plan[]>("/api/admin/plans") });
  const initial = () => ({ name: a.name, planId: a.planId ?? 0, status: a.status === "suspended" ? "suspended" : "active", expiresAt: a.expiresAt, notes: a.notes ?? "" });
  const [f, setF] = useState(initial);
  const [email, setEmail] = useState(s?.email ?? "");
  const [password, setPassword] = useState("");   // only to reset it
  const [loginStatus, setLoginStatus] = useState<Seat["status"]>(s?.status ?? "active");

  const accountDirty = JSON.stringify(f) !== JSON.stringify(initial());
  const emailChanged = !!s && email.trim().toLowerCase() !== s.email;
  const loginDirty = !!s && (emailChanged || password !== "" || loginStatus !== s.status);
  const passwordOk = password === "" || password.length >= 8;
  const ready = (accountDirty || loginDirty) && (!loginDirty || (!!email && passwordOk));

  const save = useMutation({
    mutationFn: async () => {
      if (accountDirty) await api(`/api/admin/accounts/${a.id}`, { method: "PUT", json: { ...f, notes: f.notes || null } });
      if (loginDirty && s) await api(`/api/admin/seats/${s.id}`, { method: "PUT", json: { email: email.trim(), displayName: s.displayName, status: loginStatus, password: password || null } });
    },
    onSuccess: async () => {
      showToast("تم الحفظ", "success");
      // wait for the fresh account, then start the form over from it
      await qc.invalidateQueries({ queryKey: ["admin"] });
      onSaved();
    },
  });
  const signout = useMutation({
    mutationFn: () => api(`/api/admin/seats/${s!.id}/signout`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "account", a.id] }); showToast("تم تسجيل الخروج من الجهاز", "success"); },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const left = daysUntil(f.expiresAt);
  const extendFrom = left > 0 ? f.expiresAt : new Date().toISOString().slice(0, 10);
  useEffect(() => onForm({ ready, pending: save.isPending }), [ready, save.isPending, onForm]);

  return (
    <form id={FORM_ID} className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !save.isPending) save.mutate(); }}>
      {a.status === "expired" ? <Note tone="warn" className="!mb-0">انتهى الاشتراك في {dateOnly(a.expiresAt)}. مدّد التاريخ ليرجع الدخول.</Note> : null}
      {s ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
          <div className="text-sm">
            {s.online ? <b className="text-success-text"><i className="ti ti-point-filled align-middle" aria-hidden />متصل الآن</b> : <span className="font-bold text-text-2">غير متصل</span>}
            <span className="text-text-3"> · {deviceLabel(s.userAgent)} · آخر نشاط {s.lastSeenAt ? dateTime(s.lastSeenAt) : "—"}</span>
            {s.status === "disabled" ? <Badge tone="danger" className="ms-2">الدخول معطّل</Badge> : null}
          </div>
          <Button type="button" size="sm" variant="outline" disabled={!s.online || signout.isPending} loading={signout.isPending} onClick={() => signout.mutate()}>
            <i className="ti ti-logout" aria-hidden /> تسجيل خروج
          </Button>
        </div>
      ) : <Note tone="warn" className="!mb-0">لا توجد بيانات دخول لهذا الحساب.</Note>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormGroup label="اسم الحساب" htmlFor="name" error={err?.errors?.name?.[0]}>
          <Input id="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} />
        </FormGroup>
        <FormGroup label="الباقة" htmlFor="plan" hint="تغيير الباقة يغيّر نوع الحساب وصلاحياته">
          <Select id="plan" value={f.planId} onChange={(e) => setF({ ...f, planId: Number(e.target.value) })}>
            {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="ينتهي الاشتراك" htmlFor="expires"
          hint={<span>{left >= 0 ? `بعد ${left} يوماً` : `منتهي منذ ${-left} يوماً`} · <button type="button" className="font-bold text-ink hover:underline" onClick={() => setF({ ...f, expiresAt: addDays(extendFrom, 365) })}>تمديد سنة</button></span>}>
          <Input id="expires" type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} dir="ltr" />
        </FormGroup>
        <FormGroup label="الحالة" htmlFor="status" hint={f.status === "suspended" ? "الموقوف لا يستطيع الدخول، ويخرج من جهازه عند الحفظ" : undefined}>
          <Select id="status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="active">فعّال</option>
            <option value="suspended">موقوف</option>
          </Select>
        </FormGroup>
        {s ? (
          <>
            <FormGroup label="البريد الإلكتروني" htmlFor="login-email" error={err?.errors?.email?.[0] ?? (err?.type === "email_taken" ? err.message : undefined)}
              hint={emailChanged ? "نقل الاشتراك لهذا البريد: يخرج الجهاز الحالي فوراً" : "يدخل به إلى المنصة"}>
              <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" autoComplete="off" />
            </FormGroup>
            <FormGroup label="كلمة مرور جديدة" htmlFor="login-password" error={err?.errors?.password?.[0] ?? (passwordOk ? undefined : "8 أحرف على الأقل")}
              hint="اتركها فارغة لتبقى كما هي. إن غيّرتها يخرج الجهاز الحالي فوراً">
              <Input id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" autoComplete="new-password" />
            </FormGroup>
            <FormGroup label="الدخول" htmlFor="login-status" hint={loginStatus === "disabled" ? "المعطّل لا يستطيع الدخول حتى لو كان الاشتراك فعّالاً" : undefined}>
              <Select id="login-status" value={loginStatus} onChange={(e) => setLoginStatus(e.target.value as Seat["status"])}>
                <option value="active">مسموح</option>
                <option value="disabled">معطّل</option>
              </Select>
            </FormGroup>
          </>
        ) : null}
        <FormGroup label="ملاحظات الإدارة" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} />
        </FormGroup>
      </div>
      {err && !err.errors && err.type !== "email_taken" ? <p className="text-sm font-bold text-danger-text">{err.message}</p> : null}
    </form>
  );
}
