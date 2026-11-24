"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppModal, Badge, Card, Table, TBody, Td, Th, THead, Tr } from "@platform/ui-kit";
import { api } from "@/lib/api";
import type { LegalQuestionRow } from "@/lib/admin";
import { dateTime, fmt } from "@/lib/format";
import { EmptyLine, ListSkeleton, QueryView } from "@/components/QueryView";
import { StatStrip } from "@/components/StatStrip";
import { SearchBox } from "@/components/SearchBox";
import { Seg } from "@/components/MapControls";

const PROVIDER_LABEL: Record<string, string> = { mock: "تجريبي", anthropic: "Claude", fallback: "المواد فقط" };
type Show = "all" | "notfound" | "keyword";
const SHOW: [Show, string][] = [["all", "الكل"], ["notfound", "لم يجد مواد"], ["keyword", "بحث بالكلمات"]];
const seconds = (ms: number | null) => (ms == null ? "—" : `${fmt(Math.round(ms / 100) / 10)} ث`);

/** «السجلات»: every question asked in the legal assistant (newest first), to review answer quality; a row opens the
 *  question and its full answer in a dialog. */
export default function AdminLogsPage() {
  const q = useQuery({ queryKey: ["admin", "logs", "legal"], queryFn: () => api<LegalQuestionRow[]>("/api/admin/legal-questions?limit=200") });
  return (
    <QueryView q={q} loading={<ListSkeleton rows={6} className="rounded-2xl border border-border bg-surface p-4" />}
      empty={<Card><EmptyLine>لا توجد أسئلة بعد</EmptyLine></Card>}>
      {(rows) => <Logs rows={rows} />}
    </QueryView>
  );
}

function Logs({ rows }: { rows: LegalQuestionRow[] }) {
  const [text, setText] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [open, setOpen] = useState<LegalQuestionRow | null>(null);

  const shown = useMemo(() => {
    const t = text.trim();
    return rows.filter((r) => (!t || r.question.includes(t) || (r.accountName ?? "").includes(t) || (r.email ?? "").includes(t.toLowerCase()))
      && (show === "all" || (show === "notfound" && !r.cited) || (show === "keyword" && r.search === "keyword")));
  }, [rows, text, show]);

  const [week] = useState(() => Date.now() - 7 * 86_400_000);   // fixed when the page opens
  const last7 = rows.filter((r) => Date.parse(r.createdAt) >= week).length;
  const notFound = rows.filter((r) => !r.cited).length;
  const timed = rows.filter((r) => r.durationMs != null);
  const avgMs = timed.length ? timed.reduce((s, r) => s + r.durationMs!, 0) / timed.length : null;

  return (
    <div className="space-y-5">
      <StatStrip stats={[
        { label: "الأسئلة", value: fmt(rows.length), unit: rows.length >= 200 ? "آخر 200" : "سؤال" },
        { label: "آخر 7 أيام", value: fmt(last7), unit: "سؤال" },
        { label: "لم يجد مواد", value: fmt(notFound), unit: rows.length ? `${fmt(Math.round((notFound / rows.length) * 100))}٪` : "", warn: notFound > 0 && notFound / rows.length > 0.2 },
        { label: "متوسط زمن الإجابة", value: seconds(avgMs) },
      ]} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={text} onChange={setText} placeholder="ابحث في الأسئلة أو باسم الحساب" />
        <Seg label="عرض" value={show} onChange={setShow} options={SHOW} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <THead><Tr><Th>الوقت</Th><Th>من</Th><Th className="w-full min-w-64">السؤال</Th><Th className="text-end">المواد</Th><Th>البحث</Th><Th>المصدر</Th><Th className="text-end">الزمن</Th></Tr></THead>
            <TBody>
              {shown.map((r) => (
                <Tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <Td className="whitespace-nowrap text-xs text-text-3">{dateTime(r.createdAt)}</Td>
                  <Td className="whitespace-nowrap"><b className="text-heading">{r.accountName ?? (r.email ? "—" : "مدير النظام")}</b><div className="text-xs text-text-3" dir="ltr">{r.email ?? ""}</div></Td>
                  <Td>
                    {/* the row is clickable for the mouse; this button makes it reachable by keyboard */}
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(r); }} className="line-clamp-1 text-start font-bold hover:underline">{r.question}</button>
                  </Td>
                  <Td className="text-end">{r.cited ? fmt(r.cited) : <Badge tone="warning">لم يجد</Badge>}</Td>
                  <Td className="whitespace-nowrap text-xs">{r.search === "meaning" ? "بالمعنى" : r.search === "keyword" ? "بالكلمات" : "—"}</Td>
                  <Td className="whitespace-nowrap text-xs">{PROVIDER_LABEL[r.provider] ?? r.provider}</Td>
                  <Td className="whitespace-nowrap text-end text-xs tabular-nums">{seconds(r.durationMs)}</Td>
                </Tr>
              ))}
              {!shown.length ? <Tr><Td colSpan={7} className="py-8 text-center text-text-3">لا توجد أسئلة بهذا البحث</Td></Tr> : null}
            </TBody>
          </Table>
        </div>
      </Card>

      {open ? (
        <AppModal open title="سؤال قانوني" onClose={() => setOpen(null)} maxWidthPx={720}>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-3">
              <span>{dateTime(open.createdAt)}</span>
              <span>{open.accountName ?? (open.email ? "—" : "مدير النظام")} <span dir="ltr">{open.email ?? ""}</span></span>
            </div>
            <div className="rounded-2xl rounded-ss-sm bg-ink px-4 py-3 text-sm text-white">{open.question}</div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-text">{open.answer}</div>
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 text-sm">
              <div><dt className="text-xs text-text-3">المواد المستشهد بها</dt><dd className="font-bold text-heading">{open.cited ? fmt(open.cited) : "لم يجد"}</dd></div>
              <div><dt className="text-xs text-text-3">البحث</dt><dd className="font-bold text-heading">{open.search === "meaning" ? "بالمعنى" : open.search === "keyword" ? "بالكلمات (محرك المعنى متوقف)" : "—"}</dd></div>
              <div><dt className="text-xs text-text-3">المصدر</dt><dd className="font-bold text-heading">{PROVIDER_LABEL[open.provider] ?? open.provider}</dd></div>
              <div><dt className="text-xs text-text-3">الزمن</dt><dd className="font-bold text-heading">{seconds(open.durationMs)}</dd></div>
            </dl>
          </div>
        </AppModal>
      ) : null}
    </div>
  );
}
