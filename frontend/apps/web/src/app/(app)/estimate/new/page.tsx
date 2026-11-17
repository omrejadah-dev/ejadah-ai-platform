"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardBody, CardHeader, cn, FormGroup, Input, Note, QueryErrorState, Textarea } from "@platform/ui-kit";
import { api, ApiError, isPropertyType, TYPE_LABEL, type City, type District, type EstimateRequest, type EstimateResponse, type PropertyType } from "@/lib/api";
import { fmt } from "@/lib/format";
import { busiestCityId, CityPicker, groupCities } from "@/components/CityPicker";
import { DistrictAutocomplete } from "@/components/DistrictAutocomplete";
import { EstimateResultModal } from "@/components/EstimateResult";

const FEATURES: { key: string; label: string }[] = [
  { key: "elevator", label: "مصعد" }, { key: "garden", label: "حديقة" }, { key: "pool", label: "مسبح" },
  { key: "annex", label: "ملحق" }, { key: "covered_parking", label: "مواقف مغطاة" }, { key: "central_ac", label: "تكييف مركزي" },
];
const AREA_RANGE: Record<PropertyType, [number, number]> = { land: [50, 1_000_000], apartment: [30, 2_000], villa: [100, 20_000], building: [100, 20_000] };

type Form = {
  type: PropertyType;
  /** null until the user picks: the busiest city is the default (derived, not copied into state) */
  cityId: number | null;
  district: District | null;
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
function toRequest(f: Form, cityId: number | null): EstimateRequest | null {
  if (cityId == null || !f.district || !areaOk(f)) return null;
  const b: EstimateRequest = { propertyType: f.type, cityId, districtId: f.district.id, areaM2: Number(f.area), features: f.features };
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
    const districtId = Number(params.get("districtId"));
    const districtName = params.get("districtName");
    return {
      type: isPropertyType(t) ? t : "land",
      cityId: Number(params.get("cityId")) || null,
      district: districtId && districtName ? { id: districtId, name: districtName, nMarketDeals: 0 } : null,
      planNo: "", plotNo: "", area: "", age: "", floors: "", units: "", income: "", features: [], notes: "",
    };
  });
  const patch = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  /** "تسعير جديد" from the result: an empty form, keeping the type and the city the broker works in. */
  // the district box keeps what was typed in it, so it starts over too (new key)
  const [cleared, setCleared] = useState(0);
  const clearForm = () => {
    setF((x) => ({ ...x, district: null, planNo: "", plotNo: "", area: "", age: "", floors: "", units: "", income: "", features: [], notes: "" }));
    setCleared((n) => n + 1);
  };
  // the result opens over the form (faded behind it); closing it leaves the form as it was, ready to change and price again
  const [result, setResult] = useState<EstimateResponse | null>(null);
  const field = (k: "planNo" | "plotNo" | "area" | "age" | "floors" | "units" | "income" | "notes") =>
    ({ value: f[k], onChange: (e: { target: { value: string } }) => patch({ [k]: e.target.value }) });

  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/api/cities") });
  const regions = useMemo(() => groupCities(cities.data), [cities.data]);
  const cityId = f.cityId ?? busiestCityId(regions);

  const submit = useMutation({
    mutationFn: (body: EstimateRequest) => api<EstimateResponse>("/api/estimates", { method: "POST", json: body }),
    onSuccess: (r) => {
      // the new estimate shows at once in "آخر تسعيراتك", "تسعيراتي" and the admin counts
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      qc.setQueryData(["estimate", r.id], r);   // its own page opens without another request
      setResult(r);
    },
  });

  const [minA, maxA] = AREA_RANGE[f.type];
  const areaBad = f.area !== "" && !areaOk(f);
  const body = toRequest(f, cityId);
  const d = f.district;
  const cityName = cities.data?.find((c) => c.id === cityId)?.name;

  const intro = <p className="text-sm text-text-2">الحقول تتغير حسب نوع العقار. السعر يُحسب من صفقات حقيقية مشابهة في نفس المخطط أو الحي.</p>;

  // wide screens: the form on the start side and a sticky side panel (what is being priced + the button) on the end side;
  // phones and narrow screens: one column in the same reading order as before
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:gap-6">
      <div className="min-w-0 space-y-5">
        <div className="xl:hidden">{intro}</div>

        {/* type */}
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="نوع العقار">
          {(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => (
            <button key={t} type="button" aria-pressed={f.type === t} onClick={() => patch({ ...TYPE_SPECIFIC, type: t })}
              className={cn("rounded-xl border px-3 py-3 text-sm font-bold transition", f.type === t ? "border-ink bg-ink text-white" : "border-border bg-surface text-text-2 hover:border-gold")}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <Card>
          <CardHeader><span className="font-bold text-heading">الموقع</span></CardHeader>
          {/* 2xl: region | city | district (double width), then plan | plot */}
          <CardBody className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {cities.isError ? (
              <QueryErrorState className="sm:col-span-2" error={cities.error} line="تعذّر تحميل المدن" onRetry={() => void cities.refetch()} retrying={cities.isFetching} />
            ) : (
              <CityPicker regions={regions} cityId={cityId} required idPrefix="estimate" onChange={(id) => patch({ cityId: id, district: null })} />
            )}
            <FormGroup className="sm:col-span-2" label="الحي" htmlFor="district" required
              hint={d ? (d.nMarketDeals ? `${d.name} · ${fmt(d.nMarketDeals)} صفقة سوقية` : d.name) : "اكتب أول حروف الحي واختر من القائمة"}>
              <DistrictAutocomplete key={`${cityId ?? "none"}-${cleared}`} id="district" cityId={cityId} value={d} onChange={(x) => patch({ district: x })} placeholder="مثال: الصفا" showCounts />
            </FormGroup>
            <FormGroup className="2xl:col-span-2" label="رقم المخطط" htmlFor="plan" hint="اختياري، يرفع دقة التسعير إن وُجدت صفقات في نفس المخطط">
              <Input id="plan" {...field("planNo")} maxLength={40} dir="auto" />
            </FormGroup>
            <FormGroup className="2xl:col-span-2" label="رقم القطعة" htmlFor="plot" hint="اختياري">
              <Input id="plot" {...field("plotNo")} maxLength={40} dir="auto" />
            </FormGroup>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><span className="font-bold text-heading">بيانات {TYPE_LABEL[f.type]}</span></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <FormGroup label="المساحة (م²)" htmlFor="area" required error={areaBad ? `بين ${fmt(minA)} و ${fmt(maxA)} م²` : undefined} hasError={areaBad}>
              <Input id="area" type="number" inputMode="decimal" min={minA} max={maxA} {...field("area")} dir="ltr" />
            </FormGroup>
            {f.type !== "land" ? (
              <FormGroup label="العمر (سنوات)" htmlFor="age" hint="يُعدَّل السعر بنسبة العمر التي تحددها إجادة، ويظهر التعديل تحت السعر">
                <Input id="age" type="number" min={0} max={60} {...field("age")} dir="ltr" />
              </FormGroup>
            ) : null}
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
            {f.type !== "land" ? (
              <FormGroup label="الدخل السنوي (ريال)" htmlFor="income" hint="اختياري، يُعرض العائد الإجمالي كمعلومة">
                <Input id="income" type="number" min={0} {...field("income")} dir="ltr" />
              </FormGroup>
            ) : null}
            {f.type !== "land" ? (
              // 2xl: a building has five fields, so the chips fill the rest of the second row next to the income
              <div className={cn("sm:col-span-2", f.type === "building" ? "2xl:col-span-3" : "2xl:col-span-4")}>
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
            ) : null}
            {/* half the row on 2xl: a comfortable line length (and next to the area for a land) */}
            <div className="sm:col-span-2">
              <FormGroup label="معلومات إضافية" htmlFor="notes" hint="أي شيء غير موجود في الحقول: دخل من مكينة، واجهة، شارع تجاري… يقرؤه الذكاء الاصطناعي ويعدّل السعر بنسبة محدودة، ويظهر السبب تحت السعر">
                <Textarea id="notes" rows={3} maxLength={1000} {...field("notes")} />
              </FormGroup>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* side panel: under the form on phones, sticky below the top bar (68px) on wide screens */}
      <aside className="xl:sticky xl:top-[92px]">
        <Card>
          <CardHeader><span className="font-bold text-heading">ملخص الطلب</span></CardHeader>
          <CardBody className="space-y-4">
            <div className="hidden xl:block">{intro}</div>
            <dl className="divide-y divide-border text-sm">
              {([
                ["نوع العقار", TYPE_LABEL[f.type]],
                ["المدينة", cityName],
                ["الحي", d?.name],
                ["المساحة (م²)", areaOk(f) ? fmt(Number(f.area)) : undefined],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <dt className="text-text-3">{k}</dt>
                  <dd className={cn("font-bold", v ? "text-heading" : "text-text-3")}>{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
            {submit.error ? <Note tone="danger">{submit.error instanceof ApiError ? submit.error.message : "تعذّر الاتصال بالخادم"}</Note> : null}
            <Button className="w-full" variant="primary" size="lg" disabled={!body || submit.isPending} loading={submit.isPending} onClick={() => { if (body) submit.mutate(body); }}>
              <i className="ti ti-calculator" aria-hidden /> تعرّف على السعر
            </Button>
          </CardBody>
        </Card>
      </aside>
      {result ? <EstimateResultModal data={result} onClose={() => setResult(null)} onNew={() => { setResult(null); clearForm(); }} /> : null}
    </div>
  );
}

export default function NewEstimatePage() {
  return <Suspense fallback={null}><NewEstimateInner /></Suspense>;
}
