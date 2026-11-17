"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, FormGroup, Select } from "@platform/ui-kit";
import { TrendChart } from "@/components/TrendChart";
import { busiestCityId, CityPicker, groupCities } from "@/components/CityPicker";
import { DistrictAutocomplete } from "@/components/DistrictAutocomplete";
import { QueryView } from "@/components/QueryView";
import { api, districtHistory, TYPE_LABEL, type City, type District, type PropertyType } from "@/lib/api";

export default function MarketPage() {
  const [pickedCity, setCityId] = useState<number | null>(null);
  const [type, setType] = useState<PropertyType>("land");
  const [district, setDistrict] = useState<District | null>(null);
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/api/cities") });
  const regions = useMemo(() => groupCities(cities.data), [cities.data]);
  const cityId = pickedCity ?? busiestCityId(regions);
  const hist = useQuery({ queryKey: ["history", district?.id, type], queryFn: () => districtHistory(district!.id, type), enabled: !!district });

  return (
    // Phones/tablets: filters on top, chart below. xl: filters in a side column, the chart takes the rest of the width.
    <div className="space-y-4 xl:grid xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start xl:gap-6 xl:space-y-0">
      <Card>
        <QueryView q={cities} errorLine="تعذّر تحميل المدن">
          {() => (
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-1 xl:gap-3">
              <CityPicker regions={regions} cityId={cityId} idPrefix="market" onChange={(id) => { setCityId(id); setDistrict(null); }} />
              <FormGroup label="النوع" htmlFor="market-type">
                <Select id="market-type" value={type} onChange={(e) => setType(e.target.value as PropertyType)}>
                  {(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="الحي" htmlFor="market-district">
                <DistrictAutocomplete key={cityId ?? "none"} id="market-district" cityId={cityId} value={district} onChange={setDistrict} />
              </FormGroup>
            </CardBody>
          )}
        </QueryView>
      </Card>
      {district ? (
        <Card>
          <CardHeader><span className="font-bold text-heading">{district.name} · {TYPE_LABEL[type]} · وسيط سعر المتر سنوياً</span></CardHeader>
          <CardBody>
            <QueryView q={hist} errorLine="تعذّر تحميل تاريخ الأسعار">
              {(trend) => <TrendChart district={trend} height={240} />}
            </QueryView>
          </CardBody>
        </Card>
      ) : (
        <div className="flex items-center rounded-[var(--radius-lg)] xl:min-h-[240px] xl:self-stretch xl:justify-center xl:border xl:border-dashed xl:border-border-md xl:bg-surface xl:p-6">
          <p className="text-sm text-text-3">اختر حياً لعرض تاريخ أسعاره عبر السنوات.</p>
        </div>
      )}
    </div>
  );
}
