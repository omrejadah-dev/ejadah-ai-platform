"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, cn, Select } from "@platform/ui-kit";
import { api, CONFIDENCE_LABEL, TYPE_LABEL, type PropertyType, type ValuationSummary } from "@/lib/api";
import { dateTime, fmt } from "@/lib/format";
import { confidenceTone, TYPE_ICON } from "@/lib/ui";
import { EmptyLine, ListSkeleton, QueryView } from "@/components/QueryView";
import { SavedEstimateModal } from "@/components/EstimateResult";
import { StatStrip } from "@/components/StatStrip";
import { SearchBox } from "@/components/SearchBox";

type Sort = "new" | "price" | "old";
const SORTS: Record<Sort, string> = { new: "الأحدث أولاً", price: "الأعلى سعراً", old: "الأقدم أولاً" };

/** "15.4 مليون" above a million, the plain number below. */
const short = (n: number) => (n >= 1e6 ? `${fmt(Math.round(n / 1e5) / 10)} مليون` : fmt(n));

export default function MyEstimatesPage() {
  const q = useQuery({ queryKey: ["estimates", 100], queryFn: () => api<ValuationSummary[]>("/api/estimates?limit=100") });
  // an estimate opens over the list (faded behind it)
  const [open, setOpen] = useState<ValuationSummary | null>(null);

  return (
    <div className="space-y-5">
      <QueryView q={q} loading={<ListSkeleton rows={4} className="rounded-2xl border border-border bg-surface p-4" />}
        empty={<div className="rounded-2xl border border-dashed border-border-md bg-surface"><EmptyLine>لا توجد تسعيرات بعد</EmptyLine></div>}>
        {(list) => <Estimates list={list} onOpen={setOpen} />}
      </QueryView>
      {open ? <SavedEstimateModal id={open.id} title={`${TYPE_LABEL[open.typeGroup]} · ${fmt(open.areaM2)} م²`} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Estimates({ list, onOpen }: { list: ValuationSummary[]; onOpen: (v: ValuationSummary) => void }) {
  const [text, setText] = useState("");
  const [type, setType] = useState<PropertyType | "all">("all");
  const [sort, setSort] = useState<Sort>("new");

  const shown = useMemo(() => {
    const t = text.trim();
    const hits = list.filter((v) => (type === "all" || v.typeGroup === type) && (!t || v.city.includes(t) || (v.district ?? "").includes(t)));
    const time = (v: ValuationSummary) => Date.parse(v.createdAt);
    return hits.sort((a, b) => (sort === "price" ? (b.totalEstimate ?? 0) - (a.totalEstimate ?? 0) : sort === "old" ? time(a) - time(b) : time(b) - time(a)));
  }, [list, text, type, sort]);

  const now = new Date();
  const thisMonth = list.filter((v) => { const d = new Date(v.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const total = list.reduce((s, v) => s + (v.totalEstimate ?? 0), 0);
  const high = Math.round((list.filter((v) => v.confidence === "high").length / list.length) * 100);

  return (
    <>
      <StatStrip stats={[
        { label: "كل تسعيراتك", value: fmt(list.length), unit: "تسعيرة" },
        { label: "هذا الشهر", value: fmt(thisMonth), unit: "تسعيرة" },
        { label: "قيمة العقارات المسعّرة", value: short(total), unit: "ريال" },
        { label: "بثقة عالية", value: `${fmt(high)}٪` },
      ]} />

      {/* filters sit on the page itself: search, the type as one segmented control, the order at the end */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={text} onChange={setText} placeholder="ابحث بالحي أو المدينة" />
        <div className="flex rounded-xl border border-border bg-surface p-1" role="group" aria-label="نوع العقار">
          {(["all", ...Object.keys(TYPE_LABEL)] as (PropertyType | "all")[]).map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}
              className={cn("rounded-lg px-4 py-1.5 text-[13px] font-bold transition", type === t ? "bg-ink text-white" : "text-text-2 hover:bg-row-hover")}>
              {t === "all" ? "الكل" : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-text-3 sm:ms-auto">
          ترتيب
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="!w-auto">
            {(Object.keys(SORTS) as Sort[]).map((s) => <option key={s} value={s}>{SORTS[s]}</option>)}
          </Select>
        </label>
      </div>

      {shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {shown.map((v) => (
            <button key={v.id} type="button" onClick={() => onOpen(v)}
              className="group flex flex-col gap-3.5 rounded-2xl text-start border border-border bg-surface p-[18px] transition hover:-translate-y-0.5 hover:border-gold hover:shadow-[0_10px_30px_rgba(16,43,78,.08)]">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold-d"><i className={cn("ti text-[21px]", TYPE_ICON[v.typeGroup])} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-heading">{TYPE_LABEL[v.typeGroup]} في {v.district ?? v.city}</div>
                  <div className="text-[13px] text-text-3">{v.city}</div>
                </div>
                <Badge tone={confidenceTone(v.confidence)}>{CONFIDENCE_LABEL[v.confidence]}</Badge>
              </div>
              <div className="text-[26px] font-extrabold leading-tight text-heading tabular-nums">
                {v.totalEstimate != null ? fmt(v.totalEstimate) : "—"} <span className="text-[13px] font-bold text-text-2">ريال</span>
              </div>
              <div className="flex border-t border-border pt-3 text-sm">
                <div className="flex-1"><div className="text-[11px] text-text-3">المساحة</div><b className="text-text tabular-nums">{fmt(v.areaM2)} م²</b></div>
                <div className="flex-1 border-s border-border ps-3"><div className="text-[11px] text-text-3">سعر المتر</div><b className="text-text tabular-nums">{v.ppmEstimate != null ? fmt(v.ppmEstimate) : "—"}</b></div>
              </div>
              <div className="mt-auto flex items-center justify-between text-xs text-text-3">
                <span className="tabular-nums">{dateTime(v.createdAt)}</span>
                <i className="ti ti-chevron-left text-base text-text-3 transition group-hover:-translate-x-0.5 group-hover:text-gold-d" aria-hidden />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border-md bg-surface"><EmptyLine>لا توجد تسعيرات بهذا البحث</EmptyLine></div>
      )}
    </>
  );
}
