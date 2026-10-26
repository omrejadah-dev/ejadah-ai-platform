"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal, Badge, Button, Card, cn, FormGroup, Input, Select, Spinner, Table, TBody, Td, Th, THead, Tr, Textarea } from "@platform/ui-kit";
import { api, ApiError, fmt } from "@/lib/api";
import { addDays, dateOnly, dateTime, daysUntil, localPhone, STATUS_LABEL, statusTone, type Account, type Plan } from "@/lib/admin";
import { ROLE_LABEL } from "@/lib/ui";

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "active", label: "فعّالة" },
  { key: "expiring", label: "تنتهي خلال 30 يوماً" },
  { key: "inactive", label: "موقوفة أو منتهية" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function AccountsInner() {
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>((FILTERS.find((f) => f.key === params.get("status"))?.key) ?? "all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const accounts = useQuery({ queryKey: ["admin", "accounts"], queryFn: () => api<Account[]>("/api/admin/accounts") });

  const rows = useMemo(() => {
    const term = q.trim();
    return (accounts.data ?? []).filter((a) => {
      if (term && !a.name.includes(term) && !localPhone(a.ownerPhone).includes(term)) return false;
      if (filter === "active") return a.status === "active";
      if (filter === "expiring") return a.status === "active" && daysUntil(a.expiresAt) <= 30;
      if (filter === "inactive") return a.status !== "active";
      return true;
    });
  }, [accounts.data, q, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-72" placeholder="ابحث بالاسم أو رقم الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition", filter === f.key ? "border-ink bg-ink text-white" : "border-border bg-surface text-text-2 hover:border-gold")}>
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="primary" className="ms-auto" onClick={() => setCreating(true)}><i className="ti ti-plus" aria-hidden /> حساب جديد</Button>
      </div>

      <Card>
        {accounts.isLoading ? <div className="grid place-items-center py-10"><Spinner /></div> : (
          <div className="overflow-x-auto">
            <Table>
              <THead><Tr><Th>الحساب</Th><Th>الباقة</Th><Th>المقاعد</Th><Th>الحالة</Th><Th>ينتهي</Th><Th>آخر نشاط</Th><Th>تسعيرات 30 يوماً</Th><Th>أسئلة 30 يوماً</Th></Tr></THead>
              <TBody>
                {rows.map((a) => {
                  const left = daysUntil(a.expiresAt);
                  return (
                    <Tr key={a.id}>
                      <Td>
                        <Link href={`/admin/accounts/${a.id}`} className="font-bold text-ink hover:underline">{a.name}</Link>
                        <div className="text-xs text-text-3" dir="ltr">{localPhone(a.ownerPhone)}</div>
                      </Td>
                      <Td>{a.planName ?? ROLE_LABEL[a.role]}</Td>
                      <Td>{a.seatsUsed} / {a.seatsTotal}</Td>
                      <Td><Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge></Td>
                      <Td>{dateOnly(a.expiresAt)}{a.status === "active" && left <= 30 ? <div className="text-xs font-bold text-amber-text">بعد {left} يوماً</div> : null}</Td>
                      <Td>{dateTime(a.lastSeenAt)}</Td>
                      <Td>{fmt(a.estimates30d)}</Td>
                      <Td>{fmt(a.legal30d)}</Td>
                    </Tr>
                  );
                })}
                {!rows.length ? <Tr><Td colSpan={8} className="py-8 text-center text-text-3">لا توجد حسابات</Td></Tr> : null}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
      {creating ? <CreateAccountModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CreateAccountModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: () => api<Plan[]>("/api/admin/plans") });
  const [planId, setPlanId] = useState<number | "">("");
  const plan = plans.data?.find((p) => p.id === planId);
  const [f, setF] = useState({ name: "", ownerPhone: "", ownerName: "", seats: "", expires: "", notes: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const today = new Date().toISOString().slice(0, 10);

  const create = useMutation({
    mutationFn: () => api<{ id: string }>("/api/admin/accounts", {
      method: "POST",
      json: {
        name: f.name, planId, ownerPhone: f.ownerPhone, ownerName: f.ownerName || null, notes: f.notes || null,
        seatsTotal: f.seats ? Number(f.seats) : null, expiresAt: f.expires || null,
      },
    }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      router.push(`/admin/accounts/${id}`);
    },
  });
  const err = create.error instanceof ApiError ? create.error : null;

  return (
    <AppModal open title="حساب جديد" onClose={onClose} wide
      footer={<>
        <Button onClick={onClose}>إلغاء</Button>
        <Button variant="primary" disabled={!f.name || !f.ownerPhone || !planId || create.isPending} loading={create.isPending} onClick={() => create.mutate()}>إنشاء الحساب</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormGroup label="اسم الحساب" htmlFor="name" required hint="اسم الوسيط أو المكتب أو الجهة" error={err?.errors?.name?.[0]}>
          <Input id="name" value={f.name} onChange={set("name")} maxLength={120} />
        </FormGroup>
        <FormGroup label="الباقة" htmlFor="plan" required error={err?.errors?.planId?.[0]}>
          <Select id="plan" value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">اختر</option>
            {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="جوال المالك" htmlFor="phone" required hint="يدخل به أول مرة، ويدير مقاعد المكتب"
          error={err?.errors?.ownerPhone?.[0] ?? (err?.type === "phone_taken" ? err.message : undefined)}>
          <Input id="phone" value={f.ownerPhone} onChange={set("ownerPhone")} placeholder="05XXXXXXXX" dir="ltr" inputMode="tel" />
        </FormGroup>
        <FormGroup label="اسم المالك" htmlFor="owner" hint="اختياري، يظهر في أعلى الصفحة عنده">
          <Input id="owner" value={f.ownerName} onChange={set("ownerName")} maxLength={120} />
        </FormGroup>
        <FormGroup label="عدد المقاعد" htmlFor="seats" hint={plan ? `الافتراضي من الباقة: ${plan.seats}` : undefined} error={err?.errors?.seatsTotal?.[0]}>
          <Input id="seats" type="number" min={1} max={100} value={f.seats} onChange={set("seats")} placeholder={plan ? String(plan.seats) : ""} dir="ltr" />
        </FormGroup>
        <FormGroup label="ينتهي الاشتراك" htmlFor="expires" hint={plan ? `الافتراضي: ${dateOnly(addDays(today, plan.durationDays))}` : undefined}>
          <Input id="expires" type="date" min={today} value={f.expires} onChange={set("expires")} dir="ltr" />
        </FormGroup>
        <FormGroup label="ملاحظات" htmlFor="notes" className="sm:col-span-2" hint="للإدارة فقط: رقم العقد، طريقة الدفع…">
          <Textarea id="notes" value={f.notes} onChange={set("notes")} rows={2} />
        </FormGroup>
      </div>
      {err && !err.errors && err.type !== "phone_taken" ? <p className="mt-3 text-sm font-bold text-danger-text">{err.message}</p> : null}
    </AppModal>
  );
}

export default function AdminAccountsPage() {
  return <Suspense fallback={null}><AccountsInner /></Suspense>;
}
