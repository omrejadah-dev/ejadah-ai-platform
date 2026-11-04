"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal, Badge, Button, Card, CardBody, CardHeader, confirmAction, FormGroup, Input, Note, Select, Table, TBody, Td, Th, THead, Tr, Textarea, useToast } from "@platform/ui-kit";
import { api, ApiError } from "@/lib/api";
import { addDays, daysUntil, deviceLabel, STATUS_LABEL, statusTone, type AccountDetail, type Plan, type Seat } from "@/lib/admin";
import { dateOnly, dateTime, fmt, localPhone } from "@/lib/format";
import { QueryView } from "@/components/QueryView";
import { ROLE_LABEL } from "@/lib/ui";

export default function AdminAccountPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["admin", "account", id], queryFn: () => api<AccountDetail>(`/api/admin/accounts/${id}`) });
  return (
    <QueryView q={q} errorLine="تعذّر تحميل الحساب" className="py-16">
      {(detail) => <AccountView detail={detail} />}
    </QueryView>
  );
}

function AccountView({ detail }: { detail: AccountDetail }) {
  const { account: a, seats } = detail;
  const [seatModal, setSeatModal] = useState<Seat | "new" | null>(null);
  // the form keeps unsaved edits across refetches (a seat change reloads the account); only its own save starts it over
  const [formRev, setFormRev] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold text-heading">{a.name}</h2>
        <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>
        <span className="text-sm text-text-3">{ROLE_LABEL[a.role]} · أُنشئ {dateOnly(a.createdAt)}</span>
      </div>

      <AccountForm key={`${a.id}:${formRev}`} detail={detail} onSaved={() => setFormRev((r) => r + 1)} />

      <Card>
        <CardHeader>
          <span className="font-bold text-heading">المقاعد ({a.seatsUsed} من {a.seatsTotal})</span>
          <Button size="sm" variant="outline" className="ms-auto" disabled={a.seatsUsed >= a.seatsTotal} onClick={() => setSeatModal("new")}
            title={a.seatsUsed >= a.seatsTotal ? "كل المقاعد مستخدمة، زد عدد المقاعد أولاً" : undefined}>
            <i className="ti ti-plus" aria-hidden /> إضافة مقعد
          </Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <THead><Tr><Th>الجوال</Th><Th>الاسم</Th><Th>الحالة</Th><Th>الجهاز الحالي</Th><Th>آخر نشاط</Th><Th>تسعيرات · أسئلة (30 يوماً)</Th><Th /></Tr></THead>
            <TBody>
              {seats.map((s) => <SeatRow key={s.id} seat={s} accountId={a.id} onEdit={() => setSeatModal(s)} />)}
            </TBody>
          </Table>
        </div>
        <CardBody className="text-xs text-text-3">
          كل مقعد يدخل من جهاز واحد في نفس الوقت: الدخول من جهاز جديد يُخرج القديم تلقائياً. لنقل الاشتراك لرقم آخر عدّل رقم المقعد، فيخرج الجهاز القديم فوراً.
        </CardBody>
      </Card>
      {seatModal ? <SeatModal accountId={a.id} seat={seatModal === "new" ? null : seatModal} onClose={() => setSeatModal(null)} /> : null}
    </div>
  );
}

function AccountForm({ detail, onSaved }: { detail: AccountDetail; onSaved: () => void }) {
  const a = detail.account;
  const qc = useQueryClient();
  const { showToast } = useToast();
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: () => api<Plan[]>("/api/admin/plans") });
  const initial = () => ({ name: a.name, planId: a.planId ?? 0, seatsTotal: String(a.seatsTotal), status: a.status === "suspended" ? "suspended" : "active", expiresAt: a.expiresAt, notes: a.notes ?? "" });
  const [f, setF] = useState(initial);

  const save = useMutation({
    mutationFn: (body: typeof f) => api(`/api/admin/accounts/${a.id}`, {
      method: "PUT", json: { ...body, seatsTotal: Number(body.seatsTotal), notes: body.notes || null },
    }),
    onSuccess: async () => {
      showToast("تم الحفظ", "success");
      // wait for the fresh account, then start the form over from it
      await qc.invalidateQueries({ queryKey: ["admin"] });
      onSaved();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial());
  const left = daysUntil(f.expiresAt);
  const extendFrom = left > 0 ? f.expiresAt : new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader><span className="font-bold text-heading">الاشتراك</span></CardHeader>
      <CardBody className="space-y-4">
        {a.status === "expired" ? <Note tone="warn">انتهى الاشتراك في {dateOnly(a.expiresAt)}. مدّد التاريخ ليرجع الدخول.</Note> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <FormGroup label="اسم الحساب" htmlFor="name" error={err?.errors?.name?.[0]}>
            <Input id="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} />
          </FormGroup>
          <FormGroup label="الباقة" htmlFor="plan" hint="تغيير الباقة يغيّر نوع الحساب وصلاحياته">
            <Select id="plan" value={f.planId} onChange={(e) => setF({ ...f, planId: Number(e.target.value) })}>
              {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="عدد المقاعد" htmlFor="seats" error={err?.errors?.seatsTotal?.[0]}>
            <Input id="seats" type="number" min={1} max={100} value={f.seatsTotal} onChange={(e) => setF({ ...f, seatsTotal: e.target.value })} dir="ltr" />
          </FormGroup>
          <FormGroup label="ينتهي الاشتراك" htmlFor="expires"
            hint={<span>{left >= 0 ? `بعد ${left} يوماً` : `منتهي منذ ${-left} يوماً`} · <button type="button" className="font-bold text-ink hover:underline" onClick={() => setF({ ...f, expiresAt: addDays(extendFrom, 365) })}>تمديد سنة</button></span>}>
            <Input id="expires" type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} dir="ltr" />
          </FormGroup>
          <FormGroup label="الحالة" htmlFor="status" hint={f.status === "suspended" ? "الموقوف لا يستطيع الدخول، وتُنهى جلساته عند الحفظ" : undefined}>
            <Select id="status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="active">فعّال</option>
              <option value="suspended">موقوف</option>
            </Select>
          </FormGroup>
          <FormGroup label="ملاحظات الإدارة" htmlFor="notes">
            <Textarea id="notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={1} />
          </FormGroup>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!dirty || save.isPending} loading={save.isPending} onClick={() => save.mutate(f)}>حفظ</Button>
          {dirty ? <Button variant="ghost" onClick={() => setF(initial())}>تراجع</Button> : null}
          {err && !err.errors ? <span className="text-sm font-bold text-danger-text">{err.message}</span> : null}
          <span className="ms-auto text-xs text-text-3">آخر 30 يوماً: {fmt(a.estimates30d)} تسعيرة · {fmt(a.legal30d)} سؤال قانوني</span>
        </div>
      </CardBody>
    </Card>
  );
}

function SeatRow({ seat: s, accountId, onEdit }: { seat: Seat; accountId: string; onEdit: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["admin", "account", accountId] });
    showToast(msg, "success");
  };
  const signout = useMutation({ mutationFn: () => api(`/api/admin/seats/${s.id}/signout`, { method: "POST" }), onSuccess: () => done("تم تسجيل الخروج من الجهاز") });
  const remove = useMutation({
    mutationFn: () => api(`/api/admin/seats/${s.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); done("تم حذف المقعد"); },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Tr>
      <Td dir="ltr" className="text-end font-bold">{localPhone(s.phone)}</Td>
      <Td>{s.displayName ?? "—"} {s.isOwner ? <Badge tone="primary">المالك</Badge> : null}</Td>
      <Td>{s.status === "active" ? <Badge tone="success">فعّال</Badge> : <Badge tone="danger">معطّل</Badge>}</Td>
      <Td>
        {s.online ? <span className="font-bold text-success-text"><i className="ti ti-point-filled align-middle" aria-hidden />متصل</span> : <span className="text-text-3">غير متصل</span>}
        <div className="text-xs text-text-3">{deviceLabel(s.userAgent)}</div>
      </Td>
      <Td>{dateTime(s.lastSeenAt)}</Td>
      <Td>{fmt(s.estimates30d)} · {fmt(s.legal30d)}</Td>
      <Td>
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>تعديل</Button>
          <Button size="sm" variant="ghost" disabled={!s.online || signout.isPending} onClick={() => signout.mutate()}>تسجيل خروج</Button>
          {!s.isOwner ? (
            <Button size="sm" variant="dangerOutline" disabled={remove.isPending}
              onClick={async () => {
                if (await confirmAction({ title: "حذف المقعد", message: `حذف المقعد ${localPhone(s.phone)}؟`, confirmLabel: "حذف", danger: true })) remove.mutate();
              }}>حذف</Button>
          ) : null}
        </div>
      </Td>
    </Tr>
  );
}

function SeatModal({ accountId, seat, onClose }: { accountId: string; seat: Seat | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [phone, setPhone] = useState(seat ? localPhone(seat.phone) : "");
  const [name, setName] = useState(seat?.displayName ?? "");
  const [status, setStatus] = useState(seat?.status ?? "active");
  const phoneChanged = seat && phone.replace(/\D/g, "") !== localPhone(seat.phone);

  const save = useMutation({
    mutationFn: () => seat
      ? api(`/api/admin/seats/${seat.id}`, { method: "PUT", json: { phone, displayName: name || null, status } })
      : api(`/api/admin/accounts/${accountId}/seats`, { method: "POST", json: { phone, displayName: name || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      showToast(seat ? "تم حفظ المقعد" : "تمت إضافة المقعد", "success");
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;

  return (
    <AppModal open title={seat ? "تعديل المقعد" : "إضافة مقعد"} onClose={onClose}
      footer={<>
        <Button onClick={onClose}>إلغاء</Button>
        <Button variant="primary" disabled={!phone || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>حفظ</Button>
      </>}>
      <div className="space-y-4">
        <FormGroup label="رقم الجوال" htmlFor="seat-phone" required error={err?.errors?.phone?.[0] ?? (err?.type === "phone_taken" ? err.message : undefined)}
          hint={phoneChanged ? "نقل الاشتراك لهذا الرقم: يخرج الجهاز الحالي فوراً، ويدخل الرقم الجديد برمز تحقق" : undefined}>
          <Input id="seat-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" dir="ltr" inputMode="tel" />
        </FormGroup>
        <FormGroup label="الاسم" htmlFor="seat-name" hint="اختياري">
          <Input id="seat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </FormGroup>
        {seat ? (
          <FormGroup label="الحالة" htmlFor="seat-status" hint={status === "disabled" ? "المعطّل لا يستطيع الدخول، ويخرج من جهازه عند الحفظ" : undefined}>
            <Select id="seat-status" value={status} onChange={(e) => setStatus(e.target.value as Seat["status"])}>
              <option value="active">فعّال</option>
              <option value="disabled">معطّل</option>
            </Select>
          </FormGroup>
        ) : null}
        {err && !err.errors && err.type !== "phone_taken" ? <p className="text-sm font-bold text-danger-text">{err.message}</p> : null}
      </div>
    </AppModal>
  );
}
