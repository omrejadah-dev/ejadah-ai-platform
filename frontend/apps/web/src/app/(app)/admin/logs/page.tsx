"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Table, TBody, Td, Th, THead, Tr } from "@platform/ui-kit";
import { api } from "@/lib/api";
import type { LegalQuestionRow } from "@/lib/admin";
import { dateTime, fmt } from "@/lib/format";
import { EmptyLine, ListSkeleton, QueryView } from "@/components/QueryView";

const PROVIDER_LABEL: Record<string, string> = { mock: "تجريبي", anthropic: "Claude" };

/** Every question asked in the legal assistant, newest first; a click opens the answer. */
export default function AdminLogsPage() {
  const q = useQuery({ queryKey: ["admin", "logs", "legal"], queryFn: () => api<LegalQuestionRow[]>("/api/admin/legal-questions?limit=200") });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <QueryView q={q} loading={<ListSkeleton rows={6} className="p-4" />} empty={<EmptyLine>لا توجد أسئلة بعد</EmptyLine>}>
        {(rows) => (
          <div className="overflow-x-auto">
            <Table>
              <THead><Tr><Th>الوقت</Th><Th>من</Th><Th className="w-full min-w-56">السؤال</Th><Th>المواد</Th><Th>البحث</Th><Th>المصدر</Th><Th>الزمن</Th></Tr></THead>
              <TBody>
                {rows.map((r) => {
                  const isOpen = open === r.id;
                  const toggle = () => setOpen(isOpen ? null : r.id);
                  return (
                    <Tr key={r.id} className="cursor-pointer align-top" onClick={toggle}>
                      <Td className="whitespace-nowrap">{dateTime(r.createdAt)}</Td>
                      <Td>{r.accountName ?? "—"}<div className="text-xs text-text-3" dir="ltr">{r.email ?? ""}</div></Td>
                      <Td>
                        {/* the row is clickable for the mouse; this button makes it reachable by keyboard and screen readers */}
                        <button type="button" aria-expanded={isOpen} aria-controls={`answer-${r.id}`}
                          onClick={(e) => { e.stopPropagation(); toggle(); }}
                          className="text-start font-bold hover:underline">{r.question}</button>
                        {isOpen ? <div id={`answer-${r.id}`} className="mt-2 max-w-[80ch] whitespace-pre-wrap text-sm text-text-2">{r.answer}</div> : null}
                      </Td>
                      <Td>{r.cited ? r.cited : <Badge tone="warning">لم يجد</Badge>}</Td>
                      <Td className="whitespace-nowrap">{r.search === "meaning" ? "بالمعنى" : r.search === "keyword" ? "بالكلمات" : "—"}</Td>
                      <Td className="whitespace-nowrap">{PROVIDER_LABEL[r.provider] ?? r.provider}</Td>
                      <Td dir="ltr" className="whitespace-nowrap">{r.durationMs == null ? "—" : `${fmt(r.durationMs)} ms`}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </QueryView>
    </Card>
  );
}
