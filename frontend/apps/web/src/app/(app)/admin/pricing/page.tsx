"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardBody, CardHeader, Input, Note, Spinner, Table, TBody, Td, Th, THead, Tr, useToast } from "@platform/ui-kit";
import { api, TYPE_LABEL } from "@/lib/api";
import { dateTime, type AdjustmentRule, type PricingSetting } from "@/lib/admin";

const KIND_HINT: Record<AdjustmentRule["kind"], string> = {
  per_year: "لكل سنة من عمر العقار",
  per_floor: "لكل دور فوق الأول",
  flag: "إذا وُجدت",
};

export default function AdminPricingPage() {
  const rules = useQuery({ queryKey: ["admin", "pricing", "rules"], queryFn: () => api<AdjustmentRule[]>("/api/admin/pricing/rules") });
  const settings = useQuery({ queryKey: ["admin", "pricing", "settings"], queryFn: () => api<PricingSetting[]>("/api/admin/pricing/settings") });
  if (!rules.data || !settings.data) return <div className="grid place-items-center py-16"><Spinner /></div>;

  const groups = (["villa", "apartment", "building"] as const).map((t) => ({ type: t, rules: rules.data.filter((r) => r.typeGroup === t) }));
  return (
    <div className="space-y-4">
      <Note tone="info">
        هذه النسب تُطبَّق على سعر السوق المحسوب من الصفقات: سالبة تنقص السعر وموجبة تزيده. كلها 0% حتى تعتمد إجادة قيمها.
        الأرض بلا نسب لأن العمر والمميزات لا تخصها.
      </Note>

      <Card>
        <CardHeader><span className="font-bold text-heading">الحدود</span></CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {settings.data.map((s) => <SettingRow key={s.key + s.updatedAt} setting={s} />)}
        </CardBody>
      </Card>

      {groups.map((g) => (
        <Card key={g.type}>
          <CardHeader><span className="font-bold text-heading">{TYPE_LABEL[g.type]}</span></CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead><Tr><Th>البند</Th><Th>النسبة %</Th><Th>الحد الأقصى %</Th><Th>مفعّل</Th><Th>آخر تعديل</Th><Th /></Tr></THead>
              <TBody>{g.rules.map((r) => <RuleRow key={r.id + r.updatedAt} rule={r} />)}</TBody>
            </Table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function RuleRow({ rule: r }: { rule: AdjustmentRule }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [pct, setPct] = useState(String(r.pct));
  const [cap, setCap] = useState(r.maxAbsPct == null ? "" : String(r.maxAbsPct));
  const [enabled, setEnabled] = useState(r.enabled);
  const dirty = pct !== String(r.pct) || cap !== (r.maxAbsPct == null ? "" : String(r.maxAbsPct)) || enabled !== r.enabled;

  const save = useMutation({
    mutationFn: () => api(`/api/admin/pricing/rules/${r.id}`, { method: "PUT", json: { pct: Number(pct), maxAbsPct: cap === "" ? null : Number(cap), enabled } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "pricing", "rules"] }); showToast(`تم حفظ «${r.labelAr}»`, "success"); },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Tr>
      <Td><span className="font-bold">{r.labelAr}</span><div className="text-xs text-text-3">{KIND_HINT[r.kind]}</div></Td>
      <Td><div className="w-24"><Input type="number" step="0.1" min={-50} max={50} value={pct} onChange={(e) => setPct(e.target.value)} dir="ltr" /></div></Td>
      <Td>{r.kind === "flag" ? <span className="text-text-3">—</span> :
        <div className="w-24"><Input type="number" step="1" min={0} max={50} value={cap} onChange={(e) => setCap(e.target.value)} dir="ltr" /></div>}</Td>
      <Td><input type="checkbox" className="size-4 accent-ink" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} aria-label="مفعّل" /></Td>
      <Td className="text-xs text-text-3">{dateTime(r.updatedAt)}</Td>
      <Td><Button size="sm" variant="primary" disabled={!dirty || pct === "" || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>حفظ</Button></Td>
    </Tr>
  );
}

function SettingRow({ setting: s }: { setting: PricingSetting }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [value, setValue] = useState(String(s.value));
  const save = useMutation({
    mutationFn: () => api(`/api/admin/pricing/settings/${s.key}`, { method: "PUT", json: { value: Number(value) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "pricing", "settings"] }); showToast("تم الحفظ", "success"); },
    onError: (e) => showToast(e.message, "error"),
  });
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="text-sm font-bold">{s.labelAr}</div>
      <div className="flex items-center gap-2">
        <div className="w-24"><Input type="number" min={0} max={50} value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" /></div>
        <span className="text-sm text-text-3">%</span>
        <Button size="sm" variant="primary" disabled={value === String(s.value) || value === "" || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>حفظ</Button>
      </div>
    </div>
  );
}
