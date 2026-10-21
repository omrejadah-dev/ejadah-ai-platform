"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, FormGroup, Input, Select } from "@platform/ui-kit";
import { TrendChart } from "@/components/TrendChart";
import { api, TYPE_LABEL, type City, type District, type PropertyType, type TrendPoint } from "@/lib/api";

type Row = { year: number; ppmMedian: number; nDeals: number };

export default function MarketPage() {
  const [pickedCity, setCityId] = useState<number | "">("");
  const [type, setType] = useState<PropertyType>("land");
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState<District | null>(null);
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/api/cities") });
  const cityId: number | "" = pickedCity !== "" ? pickedCity : (cities.data?.[0]?.id ?? "");
  const districts = useQuery({ queryKey: ["districts", cityId, q], queryFn: () => api<District[]>(`/api/cities/${cityId}/districts?q=${encodeURIComponent(q)}&limit=10`), enabled: cityId !== "" && q.length > 0 });
  const hist = useQuery({ queryKey: ["history", district?.id, type], queryFn: () => api<Row[]>(`/api/districts/${district!.id}/history?type=${type}`), enabled: !!district });
  const trend: TrendPoint[] | undefined = hist.data?.map((r) => ({ year: r.year, ppm_median: r.ppmMedian, n_deals: r.nDeals }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold text-heading">السوق</h1>
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <FormGroup label="المدينة"><Select value={cityId} onChange={(e) => { setCityId(Number(e.target.value)); setDistrict(null); setQ(""); }}>{cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormGroup>
          <FormGroup label="النوع"><Select value={type} onChange={(e) => setType(e.target.value as PropertyType)}>{(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></FormGroup>
          <FormGroup label="الحي">
            <div className="relative">
              <Input value={district ? district.name : q} onChange={(e) => { setDistrict(null); setQ(e.target.value); }} placeholder="ابحث عن حي" />
              {!district && q && districts.data?.length ? (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
                  {districts.data.map((d) => <li key={d.id}><button type="button" className="w-full px-3 py-2 text-start text-sm hover:bg-row-hover" onClick={() => setDistrict(d)}>{d.name}</button></li>)}
                </ul>
              ) : null}
            </div>
          </FormGroup>
        </CardBody>
      </Card>
      {district ? (
        <Card>
          <CardHeader><span className="font-bold text-heading">{district.name} · {TYPE_LABEL[type]} · وسيط سعر المتر سنوياً</span></CardHeader>
          <CardBody><TrendChart district={trend} height={240} /></CardBody>
        </Card>
      ) : <p className="text-sm text-text-3">اختر حياً لعرض تاريخ أسعاره عبر السنوات.</p>}
    </div>
  );
}
