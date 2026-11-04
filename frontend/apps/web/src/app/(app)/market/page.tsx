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
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <QueryView q={cities} errorLine="تعذّر تحميل المدن">
          {() => (
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      ) : <p className="text-sm text-text-3">اختر حياً لعرض تاريخ أسعاره عبر السنوات.</p>}
    </div>
  );
}
