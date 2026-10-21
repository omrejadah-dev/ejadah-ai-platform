"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, CardBody, CardHeader, cn, FormGroup, Input, Note, Select, Textarea } from "@platform/ui-kit";
import { api, ApiError, TYPE_LABEL, type City, type District, type EstimateRequest, type EstimateResponse, type PropertyType } from "@/lib/api";

const FEATURES: { key: string; label: string }[] = [
  { key: "elevator", label: "مصعد" }, { key: "garden", label: "حديقة" }, { key: "pool", label: "مسبح" },
  { key: "annex", label: "ملحق" }, { key: "covered_parking", label: "مواقف مغطاة" }, { key: "central_ac", label: "تكييف مركزي" },
];
const AREA_RANGE: Record<PropertyType, [number, number]> = { land: [50, 1_000_000], apartment: [30, 2_000], villa: [100, 20_000], building: [100, 20_000] };

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function NewEstimateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialType = (params.get("type") as PropertyType | null) ?? "land";

  const [type, setType] = useState<PropertyType>(["land", "villa", "apartment", "building"].includes(initialType) ? initialType : "land");
  const preCity = Number(params.get("cityId")) || "";
  const preDistrict = Number(params.get("districtId")) && params.get("districtName")
    ? { id: Number(params.get("districtId")), name: params.get("districtName")!, nMarketDeals: 0 } : null;
  const [cityId, setCityId] = useState<number | "">(preCity);
  const [district, setDistrict] = useState<District | null>(preDistrict);
  const [districtQ, setDistrictQ] = useState(preDistrict?.name ?? "");
  const [planNo, setPlanNo] = useState("");
  const [plotNo, setPlotNo] = useState("");
  const [area, setArea] = useState("");
  const [age, setAge] = useState("");
  const [floors, setFloors] = useState("");
  const [units, setUnits] = useState("");
  const [income, setIncome] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/api/cities") });
  useEffect(() => { if (cities.data?.length && cityId === "") setCityId(cities.data[0].id); }, [cities.data, cityId]);

  const q = useDebounced(districtQ);
  const districts = useQuery({
    queryKey: ["districts", cityId, q],
    queryFn: () => api<District[]>(`/api/cities/${cityId}/districts?q=${encodeURIComponent(q)}&limit=12`),
    enabled: cityId !== "" && (q.length >= 1 || districtQ === ""),
  });

  // type switch keeps the shared fields and clears the type-specific ones (spec 11.4)
  function switchType(t: PropertyType) { setType(t); setAge(""); setFloors(""); setUnits(""); setIncome(""); setFeatures([]); }

  const [minA, maxA] = AREA_RANGE[type];
  const areaN = Number(area);
  const areaOk = area !== "" && areaN >= minA && areaN <= maxA;
  const canSubmit = cityId !== "" && district && areaOk;

  const submit = useMutation({
    mutationFn: (body: EstimateRequest) => api<EstimateResponse>("/api/estimates", { method: "POST", json: body }),
    onSuccess: (r) => router.push(`/estimate/${r.id}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم"),
  });

  const body = useMemo<EstimateRequest | null>(() => {
    if (!canSubmit || !district || typeof cityId !== "number") return null;
    const b: EstimateRequest = { propertyType: type, cityId, districtId: district.id, areaM2: areaN, features };
    if (planNo.trim()) b.planNo = planNo.trim();
    if (plotNo.trim()) b.plotNo = plotNo.trim();
    if (notes.trim()) b.notes = notes.trim();
    if (type !== "land") {
      if (age !== "") b.ageYears = Number(age);
      if (income !== "") b.annualIncome = Number(income);
      if ((type === "villa" || type === "building") && floors !== "") b.floors = Number(floors);
      if (type === "building" && units !== "") b.units = Number(units);
    }
    return b;
  }, [canSubmit, cityId, district, type, areaN, features, planNo, plotNo, notes, age, income, floors, units]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-heading">تسعير عقار</h1>
        <p className="mt-1 text-sm text-text-2">الحقول تتغير حسب نوع العقار. السعر يُحسب من صفقات حقيقية مشابهة في نفس المخطط أو الحي.</p>
      </div>

      {/* type */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => (
          <button key={t} type="button" onClick={() => switchType(t)}
            className={cn("rounded-xl border px-3 py-3 text-sm font-bold transition", type === t ? "border-ink bg-ink text-white" : "border-border bg-surface text-text-2 hover:border-gold")}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><span className="font-bold text-heading">الموقع</span></CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormGroup label="المدينة" htmlFor="city" required>
            <Select id="city" value={cityId} onChange={(e) => { setCityId(Number(e.target.value)); setDistrict(null); setDistrictQ(""); }}>
              {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="الحي" htmlFor="district" required hint={district ? (district.nMarketDeals ? `${district.name} · ${district.nMarketDeals.toLocaleString("en-US")} صفقة سوقية` : district.name) : "اكتب أول حروف الحي واختر من القائمة"}>
            <div className="relative">
              <Input id="district" value={district ? district.name : districtQ} placeholder="مثال: الصفا"
                onChange={(e) => { setDistrict(null); setDistrictQ(e.target.value); }} autoComplete="off" />
              {!district && districtQ && districts.data?.length ? (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
                  {districts.data.map((d) => (
                    <li key={d.id}>
                      <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-row-hover" onClick={() => { setDistrict(d); setDistrictQ(d.name); }}>
                        <span>{d.name}</span><span className="text-xs text-text-3">{d.nMarketDeals.toLocaleString("en-US")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </FormGroup>
          <FormGroup label="رقم المخطط" htmlFor="plan" hint="اختياري، يرفع دقة التسعير إن وُجدت صفقات في نفس المخطط">
            <Input id="plan" value={planNo} onChange={(e) => setPlanNo(e.target.value)} maxLength={40} dir="auto" />
          </FormGroup>
          <FormGroup label="رقم القطعة" htmlFor="plot" hint="اختياري">
            <Input id="plot" value={plotNo} onChange={(e) => setPlotNo(e.target.value)} maxLength={40} dir="auto" />
          </FormGroup>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><span className="font-bold text-heading">بيانات {TYPE_LABEL[type]}</span></CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormGroup label="المساحة (م²)" htmlFor="area" required error={area !== "" && !areaOk ? `بين ${minA.toLocaleString("en-US")} و ${maxA.toLocaleString("en-US")} م²` : undefined} hasError={area !== "" && !areaOk}>
            <Input id="area" type="number" inputMode="decimal" min={minA} max={maxA} value={area} onChange={(e) => setArea(e.target.value)} dir="ltr" />
          </FormGroup>
          {type !== "land" ? (
            <FormGroup label="العمر (سنوات)" htmlFor="age" hint="يُعدَّل السعر بنسبة العمر التي تحددها إجادة، ويظهر التعديل تحت السعر">
              <Input id="age" type="number" min={0} max={60} value={age} onChange={(e) => setAge(e.target.value)} dir="ltr" />
            </FormGroup>
          ) : null}
          {type === "villa" || type === "building" ? (
            <FormGroup label="عدد الأدوار" htmlFor="floors">
              <Input id="floors" type="number" min={1} max={30} value={floors} onChange={(e) => setFloors(e.target.value)} dir="ltr" />
            </FormGroup>
          ) : null}
          {type === "building" ? (
            <FormGroup label="عدد الوحدات" htmlFor="units">
              <Input id="units" type="number" min={1} max={500} value={units} onChange={(e) => setUnits(e.target.value)} dir="ltr" />
            </FormGroup>
          ) : null}
          {type !== "land" ? (
            <FormGroup label="الدخل السنوي (ريال)" htmlFor="income" hint="اختياري، يُعرض العائد الإجمالي كمعلومة">
              <Input id="income" type="number" min={0} value={income} onChange={(e) => setIncome(e.target.value)} dir="ltr" />
            </FormGroup>
          ) : null}
          {type !== "land" ? (
            <div className="sm:col-span-2">
              <div className="mb-2 text-[13px] font-medium text-text-2">المميزات</div>
              <div className="flex flex-wrap gap-2">
                {FEATURES.map((f) => {
                  const on = features.includes(f.key);
                  return (
                    <button key={f.key} type="button" onClick={() => setFeatures(on ? features.filter((x) => x !== f.key) : [...features, f.key])}
                      className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition", on ? "border-ink bg-ink text-white" : "border-border-md bg-surface text-text-2 hover:border-gold")}>
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <FormGroup label="معلومات إضافية" htmlFor="notes" hint="أي شيء غير موجود في الحقول: دخل من مكينة، واجهة، شارع تجاري… يقرؤه الذكاء الاصطناعي ويعدّل السعر بنسبة محدودة، ويظهر السبب تحت السعر">
              <Textarea id="notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormGroup>
          </div>
        </CardBody>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}

      <div className="flex items-center justify-end gap-3">
        <Button variant="primary" size="lg" disabled={!body || submit.isPending} loading={submit.isPending} onClick={() => { setError(null); if (body) submit.mutate(body); }}>
          <i className="ti ti-calculator" aria-hidden /> تعرّف على السعر
        </Button>
      </div>
    </div>
  );
}

export default function NewEstimatePage() {
  return <Suspense fallback={null}><NewEstimateInner /></Suspense>;
}
