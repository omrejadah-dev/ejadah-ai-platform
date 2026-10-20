"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Spinner, Table, TBody, Td, Th, THead, Tr } from "@platform/ui-kit";
import { api, CONFIDENCE_LABEL, fmt, TYPE_LABEL, type EstimateResult, type ValuationSummary } from "@/lib/api";
import { confidenceTone } from "@/lib/ui";

export default function MyEstimatesPage() {
  const q = useQuery({ queryKey: ["estimates", 100], queryFn: () => api<ValuationSummary[]>("/api/estimates?limit=100") });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-heading">تسعيراتي</h1>
      <Card>
        {q.isLoading ? <div className="grid place-items-center py-10"><Spinner /></div> : (
          <div className="overflow-x-auto">
            <Table>
              <THead><Tr><Th>التاريخ</Th><Th>النوع</Th><Th>المدينة</Th><Th>الحي</Th><Th>المساحة</Th><Th>سعر المتر</Th><Th>السعر</Th><Th>الثقة</Th></Tr></THead>
              <TBody>
                {q.data?.map((v) => (
                  <Tr key={v.id}>
                    <Td><Link className="font-bold text-ink hover:underline" href={`/estimate/${v.id}`}>{new Date(v.createdAt).toLocaleString("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short" })}</Link></Td>
                    <Td>{TYPE_LABEL[v.typeGroup]}</Td><Td>{v.city}</Td><Td>{v.district ?? "—"}</Td><Td>{fmt(v.areaM2)}</Td>
                    <Td>{fmt(v.ppmEstimate)}</Td><Td className="font-bold">{fmt(v.totalEstimate)}</Td>
                    <Td><Badge tone={confidenceTone(v.confidence)}>{CONFIDENCE_LABEL[v.confidence as EstimateResult["confidence"]]}</Badge></Td>
                  </Tr>
                ))}
                {!q.data?.length ? <Tr><Td colSpan={8} className="py-8 text-center text-text-3">لا توجد تسعيرات بعد</Td></Tr> : null}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
