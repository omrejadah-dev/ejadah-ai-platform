"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type EstimateResponse } from "@/lib/api";
import { QueryView } from "@/components/QueryView";
import { EstimateView } from "@/components/EstimateResult";

/** A saved estimate on its own page (from "تسعيراتي", the home list, or a shared link). Right after pricing, the same
 *  result opens in a dialog over the form instead (estimate/new). */
export default function EstimatePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["estimate", id], queryFn: () => api<EstimateResponse>(`/api/estimates/${id}`) });

  return (
    <QueryView q={q} errorLine="تعذّر تحميل التسعير" className="py-20">
      {(data) => <EstimateView data={data} />}
    </QueryView>
  );
}
