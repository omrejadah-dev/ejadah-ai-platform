"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, cn, FormGroup, Input, Note, Textarea } from "@platform/ui-kit";
import { api, ApiError, isPropertyType, TYPE_LABEL, type EstimateRequest, type EstimateResponse, type Place, type PropertyType } from "@/lib/api";
import { fmt } from "@/lib/format";
import { DistrictAutocomplete } from "@/components/DistrictAutocomplete";
import { EstimateResultModal } from "@/components/EstimateResult";
import { useDistrictSummary, type DistrictSummary } from "@/components/DistrictPanel";
import { ChangePill, TrendChart, trendChange } from "@/components/TrendChart";
import { CenteredSpinner, QueryView } from "@/components/QueryView";
import { colorFor } from "@/components/mapScale";
import { THIN_DEALS, TYPE_ICON } from "@/lib/ui";
import type { DistrictCollection } from "@/components/DistrictMap";

const FEATURES: { key: string; label: string }[] = [
  { key: "elevator", label: "مصعد" }, { key: "garden", label: "حديقة" }, { key: "pool", label: "مسبح" },
  { key: "annex", label: "ملحق" }, { key: "covered_parking", label: "مواقف مغطاة" }, { key: "central_ac", label: "تكييف مركزي" },
];
const AREA_RANGE: Record<PropertyType, [number, number]> = { land: [50, 1_000_000], apartment: [30, 2_000], villa: [100, 20_000], building: [100, 20_000] };
const TYPE_HINT: Record<PropertyType, string> = { land: "سكنية أو تجارية", villa: "الأرض والبناء", apartment: "وحدة في عمارة", building: "مبنى كامل" };

type Form = {
  type: PropertyType;
  /** the district, with the city and region it belongs to (one search across the Kingdom) */
  place: Place | null;
  planNo: string; plotNo: string; area: string; age: string; floors: string; units: string; income: string;
  features: string[];
  notes: string;
};
/** Switching type keeps the shared fields and clears the type-specific ones (spec 11.4). */
const TYPE_SPECIFIC: Partial<Form> = { age: "", floors: "", units: "", income: "", features: [] };

const areaOk = (f: Form) => {
  const [min, max] = AREA_RANGE[f.type];
  const n = Number(f.area);
  return f.area !== "" && n >= min && n <= max;
};

/** The request to send, or null while the form is incomplete. */
function toRequest(f: Form): EstimateRequest | null {
  if (!f.place || !areaOk(f)) return null;
  const b: EstimateRequest = { propertyType: f.type, cityId: f.place.cityId, districtId: f.place.id, areaM2: Number(f.area), features: f.features };
  if (f.planNo.trim()) b.planNo = f.planNo.trim();
  if (f.plotNo.trim()) b.plotNo = f.plotNo.trim();
  if (f.notes.trim()) b.notes = f.notes.trim();
  if (f.type !== "land") {
    if (f.age !== "") b.ageYears = Number(f.age);
    if (f.income !== "") b.annualIncome = Number(f.income);
    if ((f.type === "villa" || f.type === "building") && f.floors !== "") b.floors = Number(f.floors);
    if (f.type === "building" && f.units !== "") b.units = Number(f.units);
  }
  return b;
}

function NewEstimateInner() {
  const qc = useQueryClient();
  const params = useSearchParams();

  // a district panel on the map links here with the type, city and district filled in
  const [f, setF] = useState<Form>(() => {
    const t = params.get("type");
    const id = Number(params.get("districtId")), cityId = Number(params.get("cityId"));
    const name = params.get("districtName"), city = params.get("cityName");
    return {
      type: isPropertyType(t) ? t : "land",
      place: id && cityId && name && city ? { id, name, cityId, city, region: "", nMarketDeals: 0 } : null,
      planNo: "", plotNo: "", area: "", age: "", floors: "", units: "", income: "", features: [], notes: "",
    };
  });
  const patch = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  // the result opens over the form (faded behind it); closing it leaves the form as it was, ready to change and price again
  const [result, setResult] = useState<EstimateResponse | null>(null);
  const field = (k: "planNo" | "plotNo" | "area" | "age" | "floors" | "units" | "income" | "notes") =>
    ({ value: f[k], onChange: (e: { target: { value: string } }) => patch({ [k]: e.target.value }) });

  const submit = useMutation({
    mutationFn: (body: EstimateRequest) => api<EstimateResponse>("/api/estimates", { method: "POST", json: body }),
    onSuccess: (r) => {
      // the new estimate shows at once in "آخر تسعيراتك", "تسعيراتي" and the admin counts
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["admin", "accounts"] });
      qc.setQueryData(["estimate", r.id], r);   // reopening it from «تسعيراتي» needs no request
      setResult(r);
    },
  });

  const [minA, maxA] = AREA_RANGE[f.type];
  const areaBad = f.area !== "" && !areaOk(f);
  const body = toRequest(f);
  const built = f.type !== "land";

  // wide screens: the form on the start side, the district's market beside it (sticky); narrower: one column, with a
  // short market line under the district box instead of the panel
  return (
    // wide screens: the two cards are always the same height (the row stretches both); the button sits at the form's bottom
    <div className="grid gap-6 xl:grid-cols-2">
      <form className="space-y-6 xl:flex xl:flex-col rounded-2xl border border-border bg-surface p-5 shadow-[0_10px_40px_rgba(16,43,78,.05)] sm:p-7"
        onSubmit={(e) => { e.preventDefault(); if (body && !submit.isPending) submit.mutate(body); }}>
        <div>
          <h2 className="text-2xl font-extrabold text-heading">سعّر عقارك</h2>
          <p className="mt-1 text-sm text-text-2">اكتب الحي ونعرض لك سوقه، والسعر يُحسب من صفقات حقيقية مشابهة في نفس الحي</p>
        </div>

        <div>
          <div id="type-label" className="mb-2 text-[13px] font-bold text-heading">نوع العقار</div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-labelledby="type-label">
            {(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => {
              const on = f.type === t;
              return (
                <button key={t} type="button" aria-pressed={on} onClick={() => patch({ ...TYPE_SPECIFIC, type: t })}
                  className={cn("flex flex-col items-center gap-1 rounded-xl border-[1.5px] px-2 pb-2.5 pt-3 transition",
                    on ? "border-ink bg-ink" : "border-border-md bg-surface hover:border-gold hover:bg-row-hover")}>
                  <i className={cn("ti text-2xl", TYPE_ICON[t], on ? "text-white" : "text-gold-d")} aria-hidden />
                  <b className={cn("text-[15px]", on ? "text-white" : "text-heading")}>{TYPE_LABEL[t]}</b>
                  <span className={cn("text-[11px]", on ? "text-white/70" : "text-text-3")}>{TYPE_HINT[t]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <FormGroup label="الحي" htmlFor="district" required>
          <DistrictAutocomplete id="district" value={f.place} onChange={(p) => patch({ place: p })}
            placeholder="اكتب اسم الحي… مثل: الصفا، النرجس" showCounts />
        </FormGroup>
        {f.place ? <div className="-mt-3 xl:hidden"><MarketLine place={f.place} type={f.type} /></div> : null}

        <FormGroup label="المساحة" htmlFor="area" required error={areaBad ? `بين ${fmt(minA)} و ${fmt(maxA)} م²` : undefined} hasError={areaBad}>
          <div className="relative">
            <Input id="area" type="number" inputMode="decimal" min={minA} max={maxA} {...field("area")} dir="ltr" placeholder="600"
              className="!h-14 !rounded-xl !pe-12 !text-xl !font-extrabold" />
            <span className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 font-bold text-text-3">م²</span>
          </div>
        </FormGroup>

        {built ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormGroup label="عمر المبنى (سنوات)" htmlFor="age" hint="يُعدَّل السعر بنسبة العمر التي تحددها إجادة">
              <Input id="age" type="number" min={0} max={60} {...field("age")} dir="ltr" />
            </FormGroup>
            {f.type === "villa" || f.type === "building" ? (
              <FormGroup label="عدد الأدوار" htmlFor="floors">
                <Input id="floors" type="number" min={1} max={30} {...field("floors")} dir="ltr" />
              </FormGroup>
            ) : null}
            {f.type === "building" ? (
              <FormGroup label="عدد الوحدات" htmlFor="units">
                <Input id="units" type="number" min={1} max={500} {...field("units")} dir="ltr" />
              </FormGroup>
            ) : null}
          </div>
        ) : null}

        <details className="group border-t border-dashed border-border-md pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-heading [&::-webkit-details-marker]:hidden">
            <i className="ti ti-adjustments-horizontal text-gold-d" aria-hidden /> تفاصيل ترفع دقة السعر
            <span className="text-[13px] font-medium text-text-3">(اختياري)</span>
            <i className="ti ti-chevron-down ms-auto text-text-3 transition group-open:rotate-180" aria-hidden />
          </summary>
          <div className="grid gap-4 pt-4 sm:grid-cols-2">
            <FormGroup label="رقم المخطط" htmlFor="plan" hint="يرفع الدقة إن وُجدت صفقات في نفس المخطط">
              <Input id="plan" {...field("planNo")} maxLength={40} dir="auto" />
            </FormGroup>
            <FormGroup label="رقم القطعة" htmlFor="plot">
              <Input id="plot" {...field("plotNo")} maxLength={40} dir="auto" />
            </FormGroup>
            {built ? (
              <>
                <FormGroup label="الدخل السنوي (ريال)" htmlFor="income" hint="يُعرض العائد الإجمالي كمعلومة">
                  <Input id="income" type="number" min={0} {...field("income")} dir="ltr" />
                </FormGroup>
                <div className="sm:col-span-2">
                  <div id="features-label" className="mb-2 text-[13px] font-medium text-text-2">المميزات</div>
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby="features-label">
                    {FEATURES.map((ft) => {
                      const on = f.features.includes(ft.key);
                      return (
                        <button key={ft.key} type="button" aria-pressed={on}
                          onClick={() => patch({ features: on ? f.features.filter((x) => x !== ft.key) : [...f.features, ft.key] })}
                          className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition", on ? "border-ink bg-ink text-white" : "border-border-md bg-surface text-text-2 hover:border-gold")}>
                          {ft.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <FormGroup label="شي ثاني يأثر على السعر؟" htmlFor="notes" hint="مثل: على شارعين، واجهة شمالية، دخل من مكينة… يقرؤه الذكاء الاصطناعي ويعدّل السعر بنسبة محدودة، ويظهر السبب تحت السعر">
                <Textarea id="notes" rows={3} maxLength={1000} {...field("notes")} />
              </FormGroup>
            </div>
          </div>
        </details>

        {submit.error ? <Note tone="danger">{submit.error instanceof ApiError ? submit.error.message : "تعذّر الاتصال بالخادم"}</Note> : null}
        <Button type="submit" className="w-full xl:mt-auto !h-14 !rounded-xl !text-base" variant="primary" size="lg" disabled={!body || submit.isPending} loading={submit.isPending}>
          <i className="ti ti-sparkles" aria-hidden /> احسب السعر
        </Button>
      </form>

      <aside className="hidden xl:flex xl:flex-col">
        {f.place ? <MarketPanel place={f.place} type={f.type} /> : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-surface px-8 py-16 text-center">
            <i className="ti ti-map-search text-5xl text-gold" aria-hidden />
            <div className="mt-3 text-lg font-extrabold text-heading">اختر الحي</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-3">نعرض لك سوقه هنا: موقعه بين الأحياء، سعر المتر، عدد الصفقات، واتجاه الأسعار</p>
          </div>
        )}
      </aside>
      {result ? <EstimateResultModal data={result} onClose={() => setResult(null)} /> : null}
    </div>
  );
}


/** What the district's market says for one type: median price per m², deals in 12 months, change over the last year.
 *  No "price × area" figure here: the estimate weighs the closest deals, age and features, and two different prices for
 *  the same property confuse (النرجس land: district median 8,000/m² vs estimate 6,830/m²). */
function figures(s: DistrictSummary, type: PropertyType) {
  const t = s.types.find((x) => x.type === type);
  return { ppm: t?.ppm ?? null, n12: t?.n12 ?? 0, change: trendChange(s.trend), thin: (t?.n12 ?? 0) < THIN_DEALS };
}

/** Narrow screens: the market in one line under the district box. */
function MarketLine({ place, type }: { place: Place; type: PropertyType }) {
  const q = useDistrictSummary(place.id, type);
  if (!q.data) return null;
  const m = figures(q.data, type);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-navy-soft px-3 py-2 text-xs text-text-2">
      <span>سعر المتر ({TYPE_LABEL[type]}) <b className="text-sm text-heading">{m.ppm ? fmt(m.ppm) : "—"}</b></span>
      <span>{fmt(m.n12)} صفقة في 12 شهراً</span>
      <ChangePill value={m.change} />
    </div>
  );
}

/** Wide screens: the district on the map among its neighbours, its price per m², deal count and trend. */
function MarketPanel({ place, type }: { place: Place; type: PropertyType }) {
  const q = useDistrictSummary(place.id, type);
  return (
    <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_10px_40px_rgba(16,43,78,.05)]">
      <div className="relative">
        <DistrictShape place={place} type={type} />
        <div className="absolute start-4 top-4 rounded-xl bg-surface/95 px-3 py-2 shadow-md">
          <div className="font-extrabold text-heading">{place.name}</div>
          <div className="text-xs text-text-3">{place.city}{place.region ? ` · منطقة ${place.region}` : ""}</div>
        </div>
      </div>
      <QueryView q={q} errorLine="تعذّر تحميل سوق الحي" loading={<CenteredSpinner className="h-72 py-0" />}>
        {(s) => {
          const m = figures(s, type);
          return (
            <div className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-text-3">متوسط سعر المتر ({TYPE_LABEL[type]})</div>
                  <div className="mt-1 text-[26px] font-extrabold text-heading">{m.ppm ? fmt(m.ppm) : "—"} <span className="text-sm font-bold text-text-2">ريال</span></div>
                </div>
                <div>
                  <div className="text-xs text-text-3">صفقات آخر 12 شهراً</div>
                  <div className="mt-1 text-[26px] font-extrabold text-heading">{fmt(m.n12)}</div>
                  {m.thin ? <div className="text-[11px] font-bold text-amber-text">بيانات قليلة لهذا النوع في الحي</div> : null}
                </div>
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-text-3">اتجاه سعر المتر · وسيط سنوي</span>
                  <ChangePill value={m.change} />
                </div>
                <TrendChart district={s.trend} height={150} />
              </div>
              <p className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-text-2">
                <i className="ti ti-info-circle text-base text-gold-d" aria-hidden />
                {m.thin ? "صفقات هذا النوع في الحي قليلة، فالسعر يعتمد أيضاً على صفقات أوسع في المدينة"
                  : "السعر يُحسب من أقرب الصفقات لعقارك في هذا الحي، مع العمر والمميزات وملاحظاتك"}
              </p>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}

/** The district drawn among its neighbours (coloured by price per m², like the market map), from the city map data. */
function DistrictShape({ place, type }: { place: Place; type: PropertyType }) {
  const map = useQuery({
    queryKey: ["map", place.cityId, type],   // the market map's query: one request serves both
    queryFn: () => api<DistrictCollection>(`/api/cities/${place.cityId}/map?type=${type}`),
    staleTime: 30 * 60_000,
  });
  const fc = map.data;
  const target = fc?.features.find((x) => x.properties.id === place.id);
  if (!fc || !target) return <div className="h-24 bg-[linear-gradient(135deg,#e9eef3,#f4f1ea)]" />;

  // equirectangular projection around the district: x = lng·cos(lat), y = −lat; the view is the district's box, doubled
  const rings = (g: GeoJSON.Polygon | GeoJSON.MultiPolygon) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates).flat();
  const k = Math.cos((target.properties.center[0] * Math.PI) / 180);
  const pts = rings(target.geometry).flat();
  const xs = pts.map(([lng]) => lng * k), ys = pts.map(([, lat]) => -lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 600, H = 230, span = Math.max((x1 - x0) / W, (y1 - y0) / H) * 2.2;   // units per pixel, with room around it
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const path = (g: GeoJSON.Polygon | GeoJSON.MultiPolygon) => rings(g).map((r) =>
    r.map(([lng, lat], i) => `${i ? "L" : "M"}${((lng * k - cx) / span + W / 2).toFixed(1)},${((-lat - cy) / span + H / 2).toFixed(1)}`).join("") + "Z").join("");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[230px] w-full bg-[#eef0ec]" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`موقع حي ${place.name}`}>
      {fc.features.filter((x) => x !== target).map((x) => (
        <path key={x.properties.id} d={path(x.geometry)} fill={colorFor(x.properties.ppm, fc.scale.ppm)} fillOpacity={0.35} stroke="#fff" strokeWidth={1.5} />
      ))}
      <path d={path(target.geometry)} fill={colorFor(target.properties.ppm, fc.scale.ppm)} fillOpacity={0.95} stroke="var(--gold)" strokeWidth={3.5} strokeLinejoin="round" />
    </svg>
  );
}

export default function NewEstimatePage() {
  return <Suspense fallback={null}><NewEstimateInner /></Suspense>;
}
