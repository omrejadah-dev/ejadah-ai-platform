"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal, Badge, Button, Card, CardBody, CardHeader, cn, Note, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@platform/ui-kit";
import { TrendChart } from "@/components/TrendChart";
import { api, can, CONFIDENCE_LABEL, TYPE_LABEL, type EstimateResponse, type EstimateTips, type PricingBreakdown } from "@/lib/api";
import { fmt } from "@/lib/format";
import { confidenceTone } from "@/lib/ui";
import { QueryView } from "@/components/QueryView";
import { useMe } from "@/providers/MeProvider";

const LEVEL_TEXT: Record<number, string> = { 1: "صفقات في نفس المخطط", 2: "صفقات في نفس الحي", 3: "صفقات في الحي والأحياء المجاورة", 4: "صفقات على مستوى المدينة" };

const signed = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${fmt(Math.abs(p))}%`;

/** "فيلا · 400 م² · مخطط 1234 · قطعة 56": what was priced. */
export const estimateTitle = ({ request: r }: EstimateResponse) =>
  `${TYPE_LABEL[r.propertyType]} · ${fmt(r.areaM2)} م²${r.planNo ? ` · مخطط ${r.planNo}` : ""}${r.plotNo ? ` · قطعة ${r.plotNo}` : ""}`;

const DISCLAIMER = "سعر السوق إحصائي من صفقات وزارة العدل المعلنة، والتعديلات نسب محددة من إجادة وقراءة آلية للمعلومات الإضافية. لا يُعدّ تقييماً معتمداً.";

/**
 * An estimate result, shown in a dialog: over the form right after pricing, or over «تسعيراتي» / the home list for a
 * saved one (there is no page of its own). The tips come right after the price and load after it: the price never waits.
 */
function EstimateView({ data }: { data: EstimateResponse }) {
  const me = useMe();
  const { request: r, result: res, grossYieldPct, pricing } = data;
  const insufficient = res.confidence === "insufficient";
  const finalTotal = pricing?.finalTotal ?? res.total_estimate;
  const finalPpm = pricing?.finalPpm ?? res.ppm_estimate;
  const adjusted = !!pricing && (pricing.items.length > 0 || (pricing.aiPct ?? 0) !== 0);
  const tips = !insufficient && can(me, "tips.generate") ? <TipsCard id={data.id} /> : null;

  return (
    <div className="space-y-4">
        {insufficient ? (
          <Note tone="warn" className="!mb-0">
            لا توجد صفقات كافية لهذا النوع في هذا الحي خلال الفترة المتاحة، فلا نعرض سعراً حتى لا نضلّلك. جرّب حياً مجاوراً أو نوعاً آخر.
          </Note>
        ) : (
          // the number on one side, how we got there beside it (from md)
          <Card className="overflow-hidden md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            {/* the one number */}
            <div className="bg-ink px-6 py-7 text-white md:flex md:flex-col md:justify-center">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-white/70">السعر التقديري للعقار</div>
                <Badge tone={confidenceTone(res.confidence)}>{CONFIDENCE_LABEL[res.confidence]}</Badge>
              </div>
              <div className="mt-1 text-4xl font-extrabold tracking-tight">{fmt(finalTotal)} <span className="text-xl font-bold text-white/70">ريال</span></div>
              <div className="mt-2 text-sm text-white/70">
                سعر المتر {fmt(finalPpm)} ريال
                {grossYieldPct != null ? <> · العائد الإجمالي {grossYieldPct}%</> : null}
              </div>
            </div>

            {/* how we got there */}
            <CardBody className="space-y-4 md:self-center">
              {adjusted && pricing ? <Breakdown p={pricing} /> : (
                <p className="text-sm leading-relaxed text-text-2">
                  سعر السوق مبنيّ على <b className="text-text">{fmt(res.sample_size)} صفقة</b> {LEVEL_TEXT[res.level_used ?? 2]} خلال آخر {res.window_months} شهراً.
                </p>
              )}

              {pricing?.aiReason ? <AiReason p={pricing} /> : null}

              {r.propertyType === "villa" ? (
                <Note tone="info" className="!mb-0">صفقات الفلل المسجلة قليلة مقارنة بالأراضي والشقق، فتقدير الفلل أقل دقة. راجع الصفقات المشابهة في التفاصيل.</Note>
              ) : null}
              {res.plot_history?.length ? (
                <Note tone="info" className="!mb-0">هذه القطعة نفسها بيعت سابقاً: {res.plot_history.map((p) => `${p.date} بسعر ${fmt(p.price)} ريال (${fmt(p.ppm)}/م²)`).join("، ")}</Note>
              ) : null}
            </CardBody>
          </Card>
        )}

        {tips}

        {!insufficient ? (
          // open from the start: the range, similar deals and the district trend are what make the price believable
          <details open className="group rounded-[var(--radius-lg)] border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-bold text-heading">
              <span>التفاصيل: النطاق، الصفقات المشابهة، اتجاه الحي</span>
              <i className="ti ti-chevron-down text-text-3 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-5 border-t border-border p-5">
              <div className="space-y-5">
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Stat label="نطاق سعر السوق" value={`${fmt(res.total_low)} – ${fmt(res.total_high)}`} unit="ريال" />
                    <Stat label="سعر المتر في السوق" value={fmt(res.ppm_estimate)} unit={`من ${fmt(res.ppm_low)} إلى ${fmt(res.ppm_high)}`} />
                    <Stat label="العينة" value={`${fmt(res.sample_size)} صفقة`} unit={`${LEVEL_TEXT[res.level_used ?? 2]} · ${res.window_months} شهراً`} />
                  </div>
                  <ul className="space-y-1 text-xs text-text-3">
                    <li>وسيط عمر الصفقات: {res.sample_median_age_months} شهراً{res.time_adjustment_pct ? ` · تصحيح زمني ${signed(res.time_adjustment_pct)} لأن العينة أقدم من سنة` : ""}</li>
                    <li>تشتت العينة (المدى الربيعي ÷ الوسيط): {res.iqr_ratio}</li>
                  </ul>
                </div>

                <div>
                  <div className="mb-2 text-sm font-bold text-heading">اتجاه سعر المتر في الحي</div>
                  <TrendChart district={res.district_trend} city={res.city_trend} />
                </div>
              </div>

              {res.comparables?.length ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-bold text-heading">الصفقات المشابهة التي بُني عليها سعر السوق</span>
                    <span className="text-xs text-text-3">آخر {res.comparables.length} صفقات</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <THead><Tr><Th>التاريخ</Th><Th>الحي</Th><Th>المخطط</Th><Th>القطعة</Th><Th>المساحة</Th><Th>سعر المتر</Th><Th>السعر</Th></Tr></THead>
                      <TBody>
                        {res.comparables.map((c, i) => (
                          <Tr key={i}>
                            <Td dir="ltr" className="whitespace-nowrap">{c.date}</Td><Td>{c.district ?? "—"}</Td><Td dir="ltr">{c.plan ?? "—"}</Td><Td dir="ltr">{c.plot ?? "—"}</Td>
                            <Td>{fmt(c.area)}</Td><Td>{fmt(c.ppm)}</Td><Td>{fmt(c.price)}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}

        <p className="text-center text-[11px] leading-relaxed text-text-3">{DISCLAIMER}</p>
    </div>
  );
}

/**
 * «نصائح لك» (spec 5.4): 5–8 points the AI writes from the computed numbers, saved with the valuation, so reopening it
 * from «تسعيراتي» shows the same tips at no cost. One regeneration per valuation. A failure leaves the price alone and
 * offers a retry.
 */
function TipsCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["tips", id],
    queryFn: () => api<EstimateTips>(`/api/estimates/${id}/tips`, { method: "POST", json: {} }),
    staleTime: Infinity, retry: false,
  });
  const again = useMutation({
    mutationFn: () => api<EstimateTips>(`/api/estimates/${id}/tips`, { method: "POST", json: { regenerate: true } }),
    onSuccess: (t) => qc.setQueryData(["tips", id], t),
  });
  const t = q.data;
  const busy = q.isFetching || again.isPending;

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 font-bold text-heading"><i className="ti ti-sparkles text-gold-d" aria-hidden /> نصائح لك</span>
        {t?.provider === "mock" ? <Badge tone="default">تجريبي</Badge> : <span className="text-[11px] text-text-3">خاتمة تنفيذية</span>}
      </CardHeader>
      <CardBody className="space-y-3">
        {busy ? (
          <div className="space-y-2.5" aria-busy="true">
            <p className="text-xs text-text-3">نكتب لك النصائح من أرقام هذا التسعير…</p>
            {[92, 80, 86, 70, 78].map((w) => <Skeleton key={w} className="h-3.5" style={{ width: `${w}%` }} />)}
          </div>
        ) : q.isError || !t ? (
          <div className="space-y-2">
            <p className="text-sm text-text-2">تعذّر توليد النصائح حالياً. السعر والتفاصيل لا تتأثر.</p>
            <Button size="sm" onClick={() => void q.refetch()}><i className="ti ti-refresh" aria-hidden /> إعادة المحاولة</Button>
          </div>
        ) : (
          <>
            <ol className="space-y-2.5">
              {t.tips.map((tip, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-text">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gold-soft text-[11px] font-bold text-gold-d">{i + 1}</span>
                  <span>{tip.text}</span>
                </li>
              ))}
            </ol>
            {again.isError ? <p className="text-xs text-danger-text">تعذّر إعادة التوليد، والنصائح أعلاه باقية.</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-[11px] leading-relaxed text-text-3">{t.disclaimer}</p>
              {t.canRegenerate ? (
                <Button size="sm" variant="ghost" onClick={() => again.mutate()} title="مرة واحدة لكل تسعير">
                  <i className="ti ti-refresh" aria-hidden /> إعادة التوليد
                </Button>
              ) : null}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * The result over the form it came from, the form faded behind it. "تعديل البيانات" closes it with the form as it was
 * (change a field and price again).
 */
export function EstimateResultModal({ data, onClose }: { data: EstimateResponse; onClose: () => void }) {
  return (
    <AppModal open title="نتيجة التسعير" subtitle={estimateTitle(data)} onClose={onClose} maxWidthPx={1040}
      footer={<Button variant="primary" onClick={onClose}><i className="ti ti-pencil" aria-hidden /> تعديل البيانات</Button>}>
      <EstimateView data={data} />
    </AppModal>
  );
}

/**
 * A saved estimate over the list it was picked from («تسعيراتي», the home list), the list faded behind it. It loads the
 * full estimate (the lists only have the summary).
 */
export function SavedEstimateModal({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["estimate", id], queryFn: () => api<EstimateResponse>(`/api/estimates/${id}`) });
  return (
    <AppModal open title="نتيجة التسعير" subtitle={q.data ? estimateTitle(q.data) : title} onClose={onClose} maxWidthPx={1040}
      footer={<Button variant="primary" onClick={onClose}>إغلاق</Button>}>
      <QueryView q={q} errorLine="تعذّر تحميل التسعير" className="py-16">
        {(data) => <EstimateView data={data} />}
      </QueryView>
    </AppModal>
  );
}

/** The explanation line: market price, each adjustment, final price. */
function Breakdown({ p }: { p: PricingBreakdown }) {
  // the sign is the operator between chips, so each chip shows only the size of the change
  const chip = (label: string, pct: number) => ({ label, value: `${fmt(Math.abs(pct))}%`, tone: pct >= 0 ? ("up" as const) : ("down" as const) });
  const chips: { label: string; value: string; tone: "up" | "down" }[] = [
    ...p.items.map((i) => chip(i.label, i.pct)),
    ...(p.aiPct ? [chip("المعلومات الإضافية", p.aiPct)] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-lg bg-surface-2 px-3 py-1.5"><span className="text-text-3">سعر السوق</span> <b className="text-text">{fmt(p.marketTotal)}</b></span>
      {chips.map((c, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="text-text-3">{c.tone === "down" ? "−" : "+"}</span>
          <span className={cn("rounded-lg px-3 py-1.5", c.tone === "down" ? "bg-danger-bg text-danger-text" : "bg-success-bg text-success-text")}>
            {c.label} <b dir="ltr">{c.value}</b>
          </span>
        </span>
      ))}
      {p.rulesCapped ? <span className="text-xs text-text-3">(مجموع العمر والمميزات وصل حده الأقصى {fmt(Math.abs(p.rulesPct))}%)</span> : null}
      <span className="text-text-3">=</span>
      <span className="rounded-lg bg-ink px-3 py-1.5 text-white"><span className="text-white/70">السعر النهائي</span> <b>{fmt(p.finalTotal)}</b></span>
    </div>
  );
}

/** What the AI read in the notes, with its reason. The trial reader is labelled as such. */
function AiReason({ p }: { p: PricingBreakdown }) {
  return (
    <div className="rounded-xl border border-gold-soft bg-gold-soft/40 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold text-heading">
        <i className="ti ti-sparkles text-gold-d" aria-hidden /> قراءة المعلومات الإضافية
        {p.aiProvider === "mock" ? <Badge tone="default">تجريبي</Badge> : null}
      </div>
      <p className="max-w-[80ch] text-sm leading-relaxed text-text-2">{p.aiReason}</p>
      {p.aiItems?.length ? (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {p.aiItems.map((i, k) => (
            <li key={k} className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-text-2">
              <i className={cn("ti", i.effect === "up" ? "ti-arrow-up text-success-text" : i.effect === "down" ? "ti-arrow-down text-danger-text" : "ti-minus text-text-3")} aria-hidden />
              {i.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-xs text-text-3">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold text-heading">{value}</div>
      <div className="text-[11px] text-text-3">{unit}</div>
    </div>
  );
}
