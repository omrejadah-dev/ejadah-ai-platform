"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, cn, Select, Spinner, Table, TBody, Td, Th, THead, Tr } from "@platform/ui-kit";
import { api, fmt } from "@/lib/api";
import { dateTime, type AiCallRow, type AuditRow, type LegalQuestionRow } from "@/lib/admin";

const TABS = [
  { key: "legal", label: "أسئلة المساعد القانوني" },
  { key: "ai", label: "الذكاء الاصطناعي" },
  { key: "audit", label: "سجل التدقيق" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const ACTION_LABEL: Record<string, string> = {
  "auth.otp_sent": "طلب رمز دخول", "auth.otp_failed": "رمز خاطئ", "auth.login": "دخول", "auth.logout": "خروج",
  "estimate.created": "تسعيرة",
  "admin.account.created": "إنشاء حساب", "admin.account.updated": "تعديل حساب",
  "admin.seat.added": "إضافة مقعد", "admin.seat.updated": "تعديل مقعد", "admin.seat.phone_changed": "نقل مقعد لرقم آخر",
  "admin.seat.deleted": "حذف مقعد", "admin.seat.signed_out": "إخراج مقعد من جهازه",
  "pricing.rule.updated": "تعديل نسبة تسعير", "pricing.setting.updated": "تعديل حد تسعير",
};
const PROVIDER_LABEL: Record<string, string> = { mock: "تجريبي", anthropic: "Claude" };

function LogsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = TABS.find((t) => t.key === params.get("tab"))?.key ?? "legal";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => router.replace(`/admin/logs?tab=${t.key}`)}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition", tab === t.key ? "border-ink bg-ink text-white" : "border-border bg-surface text-text-2 hover:border-gold")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "legal" ? <LegalLog /> : tab === "ai" ? <AiLog /> : <AuditLog />}
    </div>
  );
}

function LegalLog() {
  const q = useQuery({ queryKey: ["admin", "logs", "legal"], queryFn: () => api<LegalQuestionRow[]>("/api/admin/legal-questions?limit=200") });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      {!q.data ? <Loading /> : (
        <div className="overflow-x-auto">
          <Table>
            <THead><Tr><Th>الوقت</Th><Th>من</Th><Th>السؤال</Th><Th>المواد</Th><Th>المصدر</Th><Th>الزمن</Th></Tr></THead>
            <TBody>
              {q.data.map((r) => (
                <Tr key={r.id} className="cursor-pointer align-top" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <Td className="whitespace-nowrap">{dateTime(r.createdAt)}</Td>
                  <Td>{r.accountName ?? "—"}<div className="text-xs text-text-3" dir="ltr">{r.phone ?? ""}</div></Td>
                  <Td className="max-w-xl">
                    <div className="font-bold">{r.question}</div>
                    {open === r.id ? <div className="mt-2 whitespace-pre-wrap text-sm text-text-2">{r.answer}</div> : null}
                  </Td>
                  <Td>{r.cited ? r.cited : <Badge tone="warning">لم يجد</Badge>}</Td>
                  <Td>{PROVIDER_LABEL[r.provider] ?? r.provider}</Td>
                  <Td dir="ltr">{r.durationMs == null ? "—" : `${fmt(r.durationMs)} ms`}</Td>
                </Tr>
              ))}
              {!q.data.length ? <Empty cols={6} text="لا توجد أسئلة بعد" /> : null}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function AiLog() {
  const q = useQuery({ queryKey: ["admin", "logs", "ai"], queryFn: () => api<AiCallRow[]>("/api/admin/ai-calls?limit=200") });
  return (
    <Card>
      {!q.data ? <Loading /> : (
        <div className="overflow-x-auto">
          <Table>
            <THead><Tr><Th>الوقت</Th><Th>الخدمة</Th><Th>المزوّد</Th><Th>النتيجة</Th><Th>الزمن</Th><Th>التوكنز (دخل · خرج)</Th><Th>الجوال</Th></Tr></THead>
            <TBody>
              {q.data.map((r) => (
                <Tr key={r.id} className="align-top">
                  <Td className="whitespace-nowrap">{dateTime(r.createdAt)}</Td>
                  <Td>{r.feature}</Td>
                  <Td>{PROVIDER_LABEL[r.provider] ?? r.provider}{r.model ? <div className="text-xs text-text-3" dir="ltr">{r.model}</div> : null}</Td>
                  <Td>{r.ok ? <Badge tone="success">نجح</Badge> : <><Badge tone="danger">فشل</Badge><div className="mt-1 max-w-xs text-xs text-danger-text" dir="ltr">{r.error}</div></>}</Td>
                  <Td dir="ltr">{r.durationMs == null ? "—" : `${fmt(r.durationMs)} ms`}</Td>
                  <Td dir="ltr">{r.inputTokens == null ? "—" : `${fmt(r.inputTokens)} · ${fmt(r.outputTokens)}`}</Td>
                  <Td dir="ltr">{r.phone ?? "—"}</Td>
                </Tr>
              ))}
              {!q.data.length ? <Empty cols={7} text="لا توجد طلبات بعد" /> : null}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function AuditLog() {
  const [action, setAction] = useState("");
  const q = useQuery({
    queryKey: ["admin", "logs", "audit", action],
    queryFn: () => api<AuditRow[]>(`/api/admin/audit?limit=300${action ? `&action=${encodeURIComponent(action)}` : ""}`),
  });
  return (
    <div className="space-y-3">
      <Select className="w-full sm:w-64" value={action} onChange={(e) => setAction(e.target.value)} aria-label="نوع الحدث">
        <option value="">كل الأحداث</option>
        <option value="admin.">إجراءات المدير</option>
        <option value="auth.">الدخول والخروج</option>
        <option value="pricing.">نسب التسعير</option>
        <option value="estimate.">التسعيرات</option>
      </Select>
      <Card>
        {!q.data ? <Loading /> : (
          <div className="overflow-x-auto">
            <Table>
              <THead><Tr><Th>الوقت</Th><Th>من</Th><Th>الحدث</Th><Th>التفاصيل</Th><Th>IP</Th></Tr></THead>
              <TBody>
                {q.data.map((r) => (
                  <Tr key={r.id} className="align-top">
                    <Td className="whitespace-nowrap">{dateTime(r.at)}</Td>
                    <Td>{r.actor ?? (r.actorKind === "admin" ? "المدير" : "—")}</Td>
                    <Td>{ACTION_LABEL[r.action] ?? r.action}</Td>
                    <Td className="max-w-md text-xs text-text-3"><span dir="ltr" className="break-all">{[r.subject, r.data].filter(Boolean).join(" · ")}</span></Td>
                    <Td dir="ltr" className="text-xs">{r.ip ?? "—"}</Td>
                  </Tr>
                ))}
                {!q.data.length ? <Empty cols={5} text="لا توجد أحداث" /> : null}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

const Loading = () => <div className="grid place-items-center py-10"><Spinner /></div>;
const Empty = ({ cols, text }: { cols: number; text: string }) => <Tr><Td colSpan={cols} className="py-8 text-center text-text-3">{text}</Td></Tr>;

export default function AdminLogsPage() {
  return <Suspense fallback={null}><LogsInner /></Suspense>;
}
