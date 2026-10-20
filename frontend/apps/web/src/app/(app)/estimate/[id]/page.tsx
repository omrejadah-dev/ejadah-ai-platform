"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, CardBody, CardHeader, Note, Spinner, Table, TBody, Td, Th, THead, Tr } from "@platform/ui-kit";
import { TrendChart } from "@/components/TrendChart";
import { api, CONFIDENCE_LABEL, fmt, TYPE_LABEL, type EstimateResponse } from "@/lib/api";
import { confidenceTone } from "@/lib/ui";

const LEVEL_TEXT: Record<number, string> = { 1: "صفقات في نفس المخطط", 2: "صفقات في نفس الحي", 3: "صفقات في الحي والأحياء المجاورة", 4: "صفقات على مستوى المدينة" };

export default function EstimatePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["estimate", id], queryFn: () => api<EstimateResponse>(`/api/estimates/${id}`) });

  if (q.isLoading) return <div className="grid place-items-center py-20"><Spinner /></div>;
  if (q.isError || !q.data) return <Note tone="danger">تعذّر تحميل التسعير.</Note>;

  const { request: r, result: res, grossYieldPct } = q.data;
  const insufficient = res.confidence === "insufficient";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-gold-d">{TYPE_LABEL[r.propertyType]} · {fmt(r.areaM2)} م²{r.planNo ? ` · مخطط ${r.planNo}` : ""}{r.plotNo ? ` · قطعة ${r.plotNo}` : ""}</div>
          <h1 className="text-2xl font-extrabold text-heading">نتيجة التسعير</h1>
          <p className="text-xs text-text-3">البيانات حتى {res.data_as_of}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/estimate/new"><Button variant="default"><i className="ti ti-plus" aria-hidden /> تسعير جديد</Button></Link>
          <Button variant="outline" disabled title="قريباً"><i className="ti ti-printer" aria-hidden /> طباعة التقرير</Button>
        </div>
      </div>

      {insufficient ? (
        <Note tone="warn">
          لا توجد صفقات كافية لهذا النوع في هذا الحي خلال الفترة المتاحة، فلا نعرض سعراً حتى لا نضلّلك. جرّب حياً مجاوراً أو نوعاً آخر.
        </Note>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
            <div className="bg-ink p-6 text-white">
              <div className="text-sm text-white/70">السعر التقديري للعقار</div>
              <div className="mt-1 text-4xl font-extrabold tracking-tight">{fmt(res.total_estimate)} <span className="text-lg font-bold text-white/70">ريال</span></div>
              <div className="mt-1 text-sm text-white/70">النطاق: {fmt(res.total_low)} إلى {fmt(res.total_high)} ريال</div>
              <div className="mt-5 flex items-end gap-6">
                <div><div className="text-xs text-white/60">سعر المتر</div><div className="text-2xl font-extrabold">{fmt(res.ppm_estimate)}</div></div>
                <div><div className="text-xs text-white/60">أدنى</div><div className="text-lg font-bold">{fmt(res.ppm_low)}</div></div>
                <div><div className="text-xs text-white/60">أعلى</div><div className="text-lg font-bold">{fmt(res.ppm_high)}</div></div>
                {grossYieldPct != null ? <div><div className="text-xs text-white/60">العائد الإجمالي</div><div className="text-lg font-bold">{grossYieldPct}%</div></div> : null}
              </div>
            </div>
            <CardBody className="space-y-3">
              <Badge tone={confidenceTone(res.confidence)}>{CONFIDENCE_LABEL[res.confidence]}</Badge>
              <p className="text-sm leading-relaxed text-text-2">
                مبنيّ على <b className="text-text">{fmt(res.sample_size)} صفقة</b> {LEVEL_TEXT[res.level_used ?? 2]} خلال آخر {res.window_months} شهراً
                {res.time_adjustment_pct ? `، مع تصحيح زمني ${res.time_adjustment_pct > 0 ? "+" : ""}${res.time_adjustment_pct}% لأن العينة أقدم من سنة` : ""}.
              </p>
              <ul className="space-y-1 text-xs text-text-3">
                <li>وسيط عمر الصفقات: {res.sample_median_age_months} شهراً</li>
                <li>تشتت العينة (المدى الربيعي ÷ الوسيط): {res.iqr_ratio}</li>
              </ul>
              {res.plot_history?.length ? (
                <Note tone="info" className="mb-0">هذه القطعة نفسها بيعت سابقاً: {res.plot_history.map((p) => `${p.date} بسعر ${fmt(p.price)} ريال (${fmt(p.ppm)}/م²)`).join("، ")}</Note>
              ) : null}
            </CardBody>
          </div>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><span className="font-bold text-heading">نصائح لك</span><Badge tone="default">قريباً</Badge></CardHeader>
          <CardBody><p className="text-sm text-text-3">الخاتمة التنفيذية بالذكاء الاصطناعي تُفعَّل في المرحلة التالية. الأرقام أعلاه مستقلة عنها.</p></CardBody>
        </Card>
        <Card>
          <CardHeader><span className="font-bold text-heading">اتجاه سعر المتر في الحي</span></CardHeader>
          <CardBody><TrendChart district={res.district_trend} city={res.city_trend} /></CardBody>
        </Card>
      </div>

      {res.comparables?.length ? (
        <Card>
          <CardHeader><span className="font-bold text-heading">الصفقات المشابهة التي بُني عليها السعر</span><span className="text-xs text-text-3">آخر {res.comparables.length} صفقات</span></CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead><Tr><Th>التاريخ</Th><Th>الحي</Th><Th>المخطط</Th><Th>القطعة</Th><Th>المساحة</Th><Th>سعر المتر</Th><Th>السعر</Th></Tr></THead>
              <TBody>
                {res.comparables.map((c, i) => (
                  <Tr key={i}>
                    <Td dir="ltr">{c.date}</Td><Td>{c.district ?? "—"}</Td><Td dir="ltr">{c.plan ?? "—"}</Td><Td dir="ltr">{c.plot ?? "—"}</Td>
                    <Td>{fmt(c.area)}</Td><Td>{fmt(c.ppm)}</Td><Td>{fmt(c.price)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      ) : null}

      <p className="text-center text-[11px] leading-relaxed text-text-3">
        التسعير إحصائي من صفقات وزارة العدل المعلنة ولا يُعدّ تقييماً معتمداً. يختلف السعر الفعلي باختلاف الموقع داخل الحي والواجهة والحالة.
      </p>
    </div>
  );
}
