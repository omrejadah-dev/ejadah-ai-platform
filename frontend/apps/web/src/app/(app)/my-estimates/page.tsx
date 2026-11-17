"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, cn, Table, TBody, Td, Th, THead, Tr } from "@platform/ui-kit";
import { api, CONFIDENCE_LABEL, TYPE_LABEL, type ValuationSummary } from "@/lib/api";
import { dateTime, fmt } from "@/lib/format";
import { confidenceTone } from "@/lib/ui";
import { EmptyLine, ListSkeleton, QueryView } from "@/components/QueryView";
import { SavedEstimateModal } from "@/components/EstimateResult";

/** A column that is as wide as its content (w-px + nowrap), with room between neighbours. */
const TIGHT = "w-px whitespace-nowrap !px-4 2xl:!px-6";

export default function MyEstimatesPage() {
  const q = useQuery({ queryKey: ["estimates", 100], queryFn: () => api<ValuationSummary[]>("/api/estimates?limit=100") });
  // an estimate opens over the list (faded behind it); the links stay real links, so Ctrl/middle click opens its page
  const [open, setOpen] = useState<ValuationSummary | null>(null);
  const openHere = (v: ValuationSummary) => (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setOpen(v);
  };
  return (
    <div className="space-y-4">
      <Card>
        <QueryView q={q} loading={<ListSkeleton rows={5} className="p-4" />} empty={<EmptyLine>لا توجد تسعيرات بعد</EmptyLine>}>
          {(list) => (
            <>
              {/* Below 1100px (phones and iPads, where the sidebar leaves too little room for the columns):
                  one stacked row per estimate, so the price is never scrolled off-screen. */}
              <ul className="divide-y divide-border min-[1100px]:hidden">
                {list.map((v) => (
                  <li key={v.id}>
                    <Link href={`/estimate/${v.id}`} onClick={openHere(v)} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-row-hover">
                      <div className="min-w-0">
                        <div className="font-bold text-text">{TYPE_LABEL[v.typeGroup]} · {v.city} · {v.district ?? "—"}</div>
                        <div className="mt-0.5 text-xs text-text-3 tabular-nums">
                          المساحة {fmt(v.areaM2)} · سعر المتر {fmt(v.ppmEstimate)}
                        </div>
                        <div className="mt-0.5 text-xs text-text-3">{dateTime(v.createdAt)}</div>
                      </div>
                      <div className="shrink-0 space-y-1 text-end">
                        <div className="font-extrabold text-heading tabular-nums">{fmt(v.totalEstimate)}</div>
                        <Badge tone={confidenceTone(v.confidence)}>{CONFIDENCE_LABEL[v.confidence]}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              {/* 1100px and up: the property takes the spare width (it is what you read first); the numbers, confidence and
                  date sit together as wide as their content, so the row fills the table without gaps between them. */}
              <Table wrapClassName="hidden min-[1100px]:block">
                <THead>
                  <Tr hoverable={false}>
                    <Th scope="col" className="whitespace-nowrap !ps-6">العقار</Th>
                    <Th scope="col" className={cn(TIGHT, "text-end")}>المساحة (م²)</Th>
                    <Th scope="col" className={cn(TIGHT, "text-end")}>سعر المتر</Th>
                    <Th scope="col" className={cn(TIGHT, "text-end")}>السعر (ريال)</Th>
                    <Th scope="col" className={TIGHT}>الثقة</Th>
                    <Th scope="col" className={TIGHT}>التاريخ</Th>
                    <Th aria-hidden className="w-px !pe-4" />
                  </Tr>
                </THead>
                <TBody>
                  {list.map((v) => (
                    <Tr key={v.id} className="cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) setOpen(v); }}>
                      <Td className="whitespace-nowrap !ps-6">
                        <Link href={`/estimate/${v.id}`} onClick={openHere(v)} className="hover:underline">
                          <span className="font-bold text-text">{TYPE_LABEL[v.typeGroup]}</span>
                          <span className="text-text-3"> · {v.city} · {v.district ?? "—"}</span>
                        </Link>
                      </Td>
                      <Td num className={TIGHT}>{fmt(v.areaM2)}</Td>
                      <Td num className={TIGHT}>{fmt(v.ppmEstimate)}</Td>
                      <Td num className={cn(TIGHT, "font-bold text-heading")}>{fmt(v.totalEstimate)}</Td>
                      <Td className={TIGHT}><Badge tone={confidenceTone(v.confidence)}>{CONFIDENCE_LABEL[v.confidence]}</Badge></Td>
                      <Td className={cn(TIGHT, "text-text-2 tabular-nums")}>{dateTime(v.createdAt)}</Td>
                      <Td className="w-px !pe-4">
                        <Link href={`/estimate/${v.id}`} onClick={openHere(v)} aria-label="عرض التسعير" className="grid size-7 place-items-center rounded-md text-text-3 hover:bg-row-hover hover:text-ink">
                          <i className="ti ti-chevron-left" aria-hidden />
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </>
          )}
        </QueryView>
      </Card>
      {open ? <SavedEstimateModal id={open.id} title={`${TYPE_LABEL[open.typeGroup]} · ${fmt(open.areaM2)} م²`} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
