"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal, Button, Card, cn, FormGroup, Input, Select, Table, TBody, Td, Th, THead, Tr, Textarea } from "@platform/ui-kit";
import { api, ApiError } from "@/lib/api";
import { addDays, daysUntil, type Account, type Plan } from "@/lib/admin";
import { dateOnly, dateTime, fmt } from "@/lib/format";
import { ListSkeleton, QueryView } from "@/components/QueryView";
import { StatStrip } from "@/components/StatStrip";
import { SearchBox } from "@/components/SearchBox";
import { Seg } from "@/components/MapControls";
import { AccountDialog } from "@/components/admin/AccountDialog";
import { AccountAvatar, AccountStatusBadge, ExpiryBar, PlanChip } from "@/components/admin/AccountBits";

type Filter = "all" | "active" | "expiring" | "inactive";
const STATUS_FILTERS: [Filter, string][] = [["all", "الكل"], ["active", "فعّالة"], ["expiring", "تنتهي خلال 30 يوماً"], ["inactive", "موقوفة أو منتهية"]];
type PlanFilter = "all" | "broker" | "investor" | "developer";
const PLAN_FILTERS: [PlanFilter, string][] = [["all", "كل الباقات"], ["broker", "وسيط"], ["investor", "مستثمر"], ["developer", "مطوّر"]];

/** «الحسابات»: the numbers, filters, and one row per account; a row opens the account in a dialog (?open=<id>). */
function AccountsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>((STATUS_FILTERS.find(([k]) => k === params.get("status"))?.[0]) ?? "all");
  const [plan, setPlan] = useState<PlanFilter>("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const openId = params.get("open");
  const setOpen = (id: string | null) => router.replace(id ? `?open=${id}` : "?", { scroll: false });
  const accounts = useQuery({ queryKey: ["admin", "accounts"], queryFn: () => api<Account[]>("/api/admin/accounts") });
  const all = useMemo(() => accounts.data ?? [], [accounts.data]);

  const rows = useMemo(() => {
    const term = q.trim();
    return all.filter((a) => {
      if (term && !a.name.includes(term) && !(a.ownerEmail ?? "").includes(term.toLowerCase())) return false;
      if (plan !== "all" && a.role !== plan) return false;
      if (filter === "active") return a.status === "active";
      if (filter === "expiring") return a.status === "active" && daysUntil(a.expiresAt) <= 30;
      if (filter === "inactive") return a.status !== "active";
      return true;
    });
  }, [all, q, filter, plan]);

  const active = all.filter((a) => a.status === "active").length;
  const expiring = all.filter((a) => a.status === "active" && daysUntil(a.expiresAt) <= 30).length;
  // active accounts nobody used for a month: worth a call before they lapse
  const [monthAgo] = useState(() => Date.now() - 30 * 86_400_000);
  const idle = all.filter((a) => a.status === "active" && (!a.lastSeenAt || Date.parse(a.lastSeenAt) < monthAgo)).length;

  return (
    <div className="space-y-5">
      <StatStrip stats={[
        { label: "حسابات فعّالة", value: fmt(active), unit: `من ${fmt(all.length)}` },
        { label: "تنتهي خلال 30 يوماً", value: fmt(expiring), unit: expiring ? "تحتاج تجديد" : "حساب", warn: expiring > 0 },
        { label: "موقوفة أو منتهية", value: fmt(all.length - active), unit: "حساب" },
        { label: "بلا نشاط 30 يوماً", value: fmt(idle), unit: "حساب" },
      ]} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="ابحث بالاسم أو البريد" />
        <Seg label="الحالة" value={filter} onChange={setFilter} options={STATUS_FILTERS} />
        <Seg label="الباقة" value={plan} onChange={setPlan} options={PLAN_FILTERS} />
        <Button variant="primary" className="ms-auto" onClick={() => setCreating(true)}><i className="ti ti-plus" aria-hidden /> حساب جديد</Button>
      </div>

      <Card>
        <QueryView q={accounts} loading={<ListSkeleton rows={5} className="p-4" />}>
          {() => (
            <div className="overflow-x-auto">
              <Table>
                <THead><Tr><Th>الحساب</Th><Th>الباقة</Th><Th>الحالة</Th><Th className="w-44">الاشتراك</Th><Th className="text-end">تسعيرات 30 يوماً</Th><Th className="text-end">أسئلة 30 يوماً</Th><Th>آخر نشاط</Th></Tr></THead>
                <TBody>
                  {rows.map((a) => (
                    <Tr key={a.id} className={cn("cursor-pointer", a.status !== "active" && "text-text-3")} onClick={() => setOpen(a.id)}>
                      <Td>
                        {/* the row is clickable for the mouse; this button makes it reachable by keyboard */}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(a.id); }} className="flex items-center gap-3 text-start">
                          <AccountAvatar account={a} />
                          <span className="min-w-0">
                            <b className="block text-heading hover:underline">{a.name}</b>
                            <span className="block text-xs text-text-3" dir="ltr">{a.ownerEmail ?? "—"}</span>
                          </span>
                        </button>
                      </Td>
                      <Td><PlanChip account={a} /></Td>
                      <Td><AccountStatusBadge account={a} /></Td>
                      <Td><ExpiryBar account={a} /></Td>
                      <Td className="text-end font-bold tabular-nums">{fmt(a.estimates30d)}</Td>
                      <Td className="text-end tabular-nums">{fmt(a.legal30d)}</Td>
                      <Td className="whitespace-nowrap text-xs text-text-3">{a.lastSeenAt ? dateTime(a.lastSeenAt) : "—"}</Td>
                    </Tr>
                  ))}
                  {!rows.length ? <Tr><Td colSpan={7} className="py-8 text-center text-text-3">لا توجد حسابات بهذا البحث</Td></Tr> : null}
                </TBody>
              </Table>
            </div>
          )}
        </QueryView>
      </Card>
      {creating ? <CreateAccountModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} /> : null}
      {openId ? <AccountDialog id={openId} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: () => api<Plan[]>("/api/admin/plans") });
  const [planId, setPlanId] = useState<number | "">("");
  const plan = plans.data?.find((p) => p.id === planId);
  // one account = one login; the account's name is also the login's name
  const [f, setF] = useState({ name: "", ownerEmail: "", ownerPassword: "", expires: "", notes: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const today = new Date().toISOString().slice(0, 10);

  const create = useMutation({
    mutationFn: () => api<{ id: string }>("/api/admin/accounts", {
      method: "POST",
      json: {
        name: f.name, planId, ownerEmail: f.ownerEmail.trim(), ownerPassword: f.ownerPassword, ownerName: f.name, notes: f.notes || null,
        seatsTotal: null, expiresAt: f.expires || null,
      },
    }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      onCreated(id);   // the new account opens in its dialog, e.g. to add notes
    },
  });
  const err = create.error instanceof ApiError ? create.error : null;

  return (
    <AppModal open title="حساب جديد" onClose={onClose} wide
      footer={<>
        <Button onClick={onClose}>إلغاء</Button>
        <Button variant="primary" disabled={!f.name || !f.ownerEmail || f.ownerPassword.length < 8 || !planId || create.isPending} loading={create.isPending} onClick={() => create.mutate()}>إنشاء الحساب</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormGroup label="اسم الحساب" htmlFor="name" required hint="اسم الوسيط أو المستثمر أو الجهة" error={err?.errors?.name?.[0]}>
          <Input id="name" value={f.name} onChange={set("name")} maxLength={120} />
        </FormGroup>
        <FormGroup label="الباقة" htmlFor="plan" required error={err?.errors?.planId?.[0]}>
          <Select id="plan" value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">اختر</option>
            {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="البريد الإلكتروني" htmlFor="email" required hint="يدخل به إلى المنصة"
          error={err?.errors?.ownerEmail?.[0] ?? (err?.type === "email_taken" ? err.message : undefined)}>
          <Input id="email" type="email" value={f.ownerEmail} onChange={set("ownerEmail")} placeholder="name@company.com" dir="ltr" autoComplete="off" />
        </FormGroup>
        <FormGroup label="كلمة المرور" htmlFor="password" required hint="8 أحرف على الأقل، أرسلها له مع البريد" error={err?.errors?.ownerPassword?.[0]}>
          <Input id="password" value={f.ownerPassword} onChange={set("ownerPassword")} dir="ltr" autoComplete="new-password" />
        </FormGroup>
        <FormGroup label="ينتهي الاشتراك" htmlFor="expires" hint={plan ? `الافتراضي: ${dateOnly(addDays(today, plan.durationDays))}` : undefined}>
          <Input id="expires" type="date" min={today} value={f.expires} onChange={set("expires")} dir="ltr" />
        </FormGroup>
        <FormGroup label="ملاحظات" htmlFor="notes" className="sm:col-span-2" hint="للإدارة فقط: رقم العقد، طريقة الدفع…">
          <Textarea id="notes" value={f.notes} onChange={set("notes")} rows={2} />
        </FormGroup>
      </div>
      {err && !err.errors && err.type !== "email_taken" ? <p className="mt-3 text-sm font-bold text-danger-text">{err.message}</p> : null}
    </AppModal>
  );
}

export default function AdminAccountsPage() {
  return <Suspense fallback={null}><AccountsInner /></Suspense>;
}
