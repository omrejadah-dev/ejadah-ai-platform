"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Table, TBody, Td, Th, THead, Tr } from "@platform/ui-kit";
import { api, CONFIDENCE_LABEL, TYPE_LABEL, type ValuationSummary } from "@/lib/api";
import { dateTime, fmt } from "@/lib/format";
import { confidenceTone } from "@/lib/ui";
import { EmptyLine, ListSkeleton, QueryView } from "@/components/QueryView";

export default function MyEstimatesPage() {
  const q = useQuery({ queryKey: ["estimates", 100], queryFn: () => api<ValuationSummary[]>("/api/estimates?limit=100") });
  return (
    <div className="space-y-4">
      <Card>
        <QueryView q={q} loading={<ListSkeleton rows={5} className="p-4" />} empty={<EmptyLine>لا توجد تسعيرات بعد</EmptyLine>}>
          {(list) => (
            <div className="overflow-x-auto">
              <Table>
                <THead><Tr><Th>التاريخ</Th><Th>النوع</Th><Th>المدينة</Th><Th>الحي</Th><Th>المساحة</Th><Th>سعر المتر</Th><Th>السعر</Th><Th>الثقة</Th></Tr></THead>
                <TBody>
                  {list.map((v) => (
                    <Tr key={v.id}>
                      <Td><Link className="font-bold text-ink hover:underline" href={`/estimate/${v.id}`}>{dateTime(v.createdAt)}</Link></Td>
                      <Td>{TYPE_LABEL[v.typeGroup]}</Td><Td>{v.city}</Td><Td>{v.district ?? "—"}</Td><Td>{fmt(v.areaM2)}</Td>
                      <Td>{fmt(v.ppmEstimate)}</Td><Td className="font-bold">{fmt(v.totalEstimate)}</Td>
                      <Td><Badge tone={confidenceTone(v.confidence)}>{CONFIDENCE_LABEL[v.confidence]}</Badge></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </QueryView>
      </Card>
    </div>
  );
}
