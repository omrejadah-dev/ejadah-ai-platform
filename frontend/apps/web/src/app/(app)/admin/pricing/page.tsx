"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal, Badge, Button, Card, cn, FormGroup, Input, Table, TBody, Td, Th, THead, Tr, useToast } from "@platform/ui-kit";
import { QueryView } from "@/components/QueryView";
import { StatStrip } from "@/components/StatStrip";
import { SearchBox } from "@/components/SearchBox";
import { Seg } from "@/components/MapControls";
import { api, TYPE_LABEL } from "@/lib/api";
import { type AdjustmentRule, type PricingSetting } from "@/lib/admin";
import { dateTime, fmt } from "@/lib/format";
import { TYPE_ICON } from "@/lib/ui";

const KIND_HINT: Record<AdjustmentRule["kind"], string> = {
  per_year: "لكل سنة من عمر العقار",
  per_floor: "لكل دور فوق الأول",
  flag: "إذا وُجدت",
};
type TypeFilter = "all" | AdjustmentRule["typeGroup"];
const TYPE_FILTERS: [TypeFilter, string][] = [["all", "كل الأنواع"], ["villa", "فيلا"], ["apartment", "شقة"], ["building", "عمارة"]];
const signedPct = (p: number) => `${p > 0 ? "+" : ""}${fmt(p)}%`;

/** «نسب التسعير»: the percentages applied to the market price (by type) and the two caps; a row (or a cap) opens it
 *  in a dialog to edit. */
export default function AdminPricingPage() {
  const rules = useQuery({ queryKey: ["admin", "pricing", "rules"], queryFn: () => api<AdjustmentRule[]>("/api/admin/pricing/rules") });
  const settings = useQuery({ queryKey: ["admin", "pricing", "settings"], queryFn: () => api<PricingSetting[]>("/api/admin/pricing/settings") });
  return (
    <QueryView q={rules} className="py-16">
      {(r) => (
        <QueryView q={settings} className="py-16">
          {(s) => <PricingBody rules={r} settings={s} />}
        </QueryView>
      )}
    </QueryView>
  );
}

function PricingBody({ rules, settings }: { rules: AdjustmentRule[]; settings: PricingSetting[] }) {
  const [type, setType] = useState<TypeFilter>("all");
  const [text, setText] = useState("");
  const [rule, setRule] = useState<AdjustmentRule | null>(null);
  const [caps, setCaps] = useState(false);
  const shown = rules.filter((r) => (type === "all" || r.typeGroup === type) && (!text.trim() || r.labelAr.includes(text.trim())));
  const enabled = rules.filter((r) => r.enabled).length;
  const nonZero = rules.filter((r) => r.enabled && r.pct !== 0).length;
  // the rule being edited, fresh from the list (it updates after a save)
  const editing = rule ? rules.find((r) => r.id === rule.id) ?? rule : null;

  return (
    <div className="space-y-5">
      <StatStrip stats={[
        ...settings.map((s) => ({ label: s.labelAr, value: `${fmt(s.value)}%`, unit: "تعديل", onClick: () => setCaps(true) })),
        { label: "بنود مفعّلة", value: fmt(enabled), unit: `من ${fmt(rules.length)}` },
        { label: "بنود تغيّر السعر الآن", value: fmt(nonZero), unit: nonZero ? "بنسبة غير 0%" : "كلها 0%", warn: nonZero === 0 },
      ].slice(0, 4)} />

      <p className="flex items-start gap-2 text-xs leading-relaxed text-text-3">
        <i className="ti ti-info-circle mt-0.5 text-sm text-gold-d" aria-hidden />
        هذه النسب تُطبَّق على سعر السوق المحسوب من الصفقات: سالبة تنقص السعر وموجبة تزيده. الأرض بلا نسب لأن العمر والمميزات لا تخصها.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={text} onChange={setText} placeholder="ابحث باسم البند" />
        <Seg label="النوع" value={type} onChange={setType} options={TYPE_FILTERS} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <THead><Tr><Th>البند</Th><Th>النوع</Th><Th className="text-end">النسبة</Th><Th className="text-end">الحد الأقصى</Th><Th>الحالة</Th><Th>آخر تعديل</Th></Tr></THead>
            <TBody>
              {shown.map((r) => (
                <Tr key={r.id} className={cn("cursor-pointer", !r.enabled && "text-text-3")} onClick={() => setRule(r)}>
                  <Td>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setRule(r); }} className="text-start">
                      <b className="text-heading hover:underline">{r.labelAr}</b>
                      <span className="block text-xs text-text-3">{KIND_HINT[r.kind]}</span>
                    </button>
                  </Td>
                  <Td className="whitespace-nowrap"><i className={cn("ti me-1 text-gold-d", TYPE_ICON[r.typeGroup])} aria-hidden />{TYPE_LABEL[r.typeGroup]}</Td>
                  <Td className={cn("text-end font-bold tabular-nums", r.pct > 0 ? "text-success-text" : r.pct < 0 ? "text-danger-text" : "text-text-3")}>{signedPct(r.pct)}</Td>
                  <Td className="text-end tabular-nums">{r.kind === "flag" || r.maxAbsPct == null ? "—" : `${fmt(r.maxAbsPct)}%`}</Td>
                  <Td>{r.enabled ? <Badge tone="success">مفعّل</Badge> : <Badge tone="default">موقوف</Badge>}</Td>
                  <Td className="whitespace-nowrap text-xs text-text-3">{dateTime(r.updatedAt)}</Td>
                </Tr>
              ))}
              {!shown.length ? <Tr><Td colSpan={6} className="py-8 text-center text-text-3">لا توجد بنود بهذا البحث</Td></Tr> : null}
            </TBody>
          </Table>
        </div>
      </Card>

      {editing ? <RuleDialog key={editing.id + editing.updatedAt} rule={editing} onClose={() => setRule(null)} /> : null}
      {caps ? <CapsDialog settings={settings} onClose={() => setCaps(false)} /> : null}
    </div>
  );
}

/** One rule in a dialog over the list: its percentage, its cap and whether it applies; the footer only saves. */
function RuleDialog({ rule: r, onClose }: { rule: AdjustmentRule; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [pct, setPct] = useState(String(r.pct));
  const [cap, setCap] = useState(r.maxAbsPct == null ? "" : String(r.maxAbsPct));
  const [enabled, setEnabled] = useState(r.enabled);
  const dirty = pct !== String(r.pct) || cap !== (r.maxAbsPct == null ? "" : String(r.maxAbsPct)) || enabled !== r.enabled;

  const save = useMutation({
    mutationFn: () => api(`/api/admin/pricing/rules/${r.id}`, { method: "PUT", json: { pct: Number(pct), maxAbsPct: cap === "" ? null : Number(cap), enabled } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["admin", "pricing", "rules"] }); showToast(`تم حفظ «${r.labelAr}»`, "success"); onClose(); },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <AppModal open title={`${r.labelAr} · ${TYPE_LABEL[r.typeGroup]}`} onClose={onClose} maxWidthPx={520}
      footer={<Button variant="primary" disabled={!dirty || pct === "" || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>
        <i className="ti ti-device-floppy" aria-hidden /> حفظ
      </Button>}>
      <div className="space-y-4">
        <p className="text-sm text-text-2">{KIND_HINT[r.kind]}: النسبة تُطبَّق على سعر السوق، سالبة تنقصه وموجبة تزيده.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormGroup label="النسبة %" htmlFor="rule-pct" hint="بين −50 و +50">
            <Input id="rule-pct" type="number" step="0.1" min={-50} max={50} value={pct} onChange={(e) => setPct(e.target.value)} dir="ltr" />
          </FormGroup>
          {r.kind !== "flag" ? (
            <FormGroup label="الحد الأقصى %" htmlFor="rule-cap" hint={r.kind === "per_year" ? "أقصى ما يصل إليه البند مهما زاد العمر" : "أقصى ما يصل إليه البند مهما زادت الأدوار"}>
              <Input id="rule-cap" type="number" step="1" min={0} max={50} value={cap} onChange={(e) => setCap(e.target.value)} dir="ltr" />
            </FormGroup>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-bold text-heading">
            <input type="checkbox" className="size-4 accent-ink" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> مفعّل
          </label>
          <span className="text-xs text-text-3">آخر تعديل {dateTime(r.updatedAt)}</span>
        </div>
      </div>
    </AppModal>
  );
}

/** The two caps in one dialog, saved together by the footer's «حفظ». */
function CapsDialog({ settings, onClose }: { settings: PricingSetting[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [values, setValues] = useState(() => Object.fromEntries(settings.map((s) => [s.key, String(s.value)])));
  const changed = settings.filter((s) => values[s.key] !== String(s.value));
  const save = useMutation({
    mutationFn: async () => { for (const s of changed) await api(`/api/admin/pricing/settings/${s.key}`, { method: "PUT", json: { value: Number(values[s.key]) } }); },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["admin", "pricing", "settings"] }); showToast("تم الحفظ", "success"); onClose(); },
    onError: (e) => showToast(e.message, "error"),
  });
  return (
    <AppModal open title="الحدود" onClose={onClose} maxWidthPx={520}
      footer={<Button variant="primary" disabled={!changed.length || changed.some((s) => values[s.key] === "") || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>
        <i className="ti ti-device-floppy" aria-hidden /> حفظ
      </Button>}>
      <div className="space-y-4">
        <p className="text-sm text-text-2">أقصى ما يغيّره مجموع البنود، وأقصى ما تغيّره قراءة الذكاء الاصطناعي للمعلومات الإضافية، من سعر السوق.</p>
        {settings.map((s) => (
          <FormGroup key={s.key} label={`${s.labelAr}`} htmlFor={`set-${s.key}`} hint={`آخر تعديل ${dateTime(s.updatedAt)}`}>
            <Input id={`set-${s.key}`} type="number" min={0} max={50} value={values[s.key]} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} dir="ltr" />
          </FormGroup>
        ))}
      </div>
    </AppModal>
  );
}
