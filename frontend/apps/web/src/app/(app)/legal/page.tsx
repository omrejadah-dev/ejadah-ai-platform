"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardBody, CardHeader, cn, Note, Spinner, Textarea } from "@platform/ui-kit";
import { api, type LegalAnswer, type LegalHistory, type LegalLaw, type LegalSource } from "@/lib/api";
import { fmt } from "@/lib/format";
import { CenteredSpinner, EmptyLine, QueryView } from "@/components/QueryView";

const SUGGESTIONS = [
  "كم عمولة الوسيط العقاري؟",
  "هل يجب أن يكون عقد الوساطة مكتوباً؟",
  "هل يجوز لغير السعودي تملك عقار؟",
  "كم نسبة ضريبة التصرفات العقارية؟",
];

type Turn = { q: string; a?: LegalAnswer; error?: string };

export default function LegalPage() {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  const laws = useQuery({ queryKey: ["legal-laws"], queryFn: () => api<LegalLaw[]>("/api/legal/laws"), staleTime: 60 * 60_000 });
  const history = useQuery({ queryKey: ["legal-history"], queryFn: () => api<LegalHistory[]>("/api/legal/history?limit=8") });

  const ask = useMutation({
    mutationFn: (question: string) => api<LegalAnswer>("/api/legal/ask", { method: "POST", json: { question } }),
    onSuccess: (a) => {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
      void qc.invalidateQueries({ queryKey: ["legal-history"] });
    },
    onError: (e: Error) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: e.message || "تعذّر الحصول على إجابة" } : x))),
  });

  function send(text: string) {
    const q = text.trim();
    if (q.length < 3 || ask.isPending) return;
    setTurns((t) => [...t, { q }]);
    setInput("");
    ask.mutate(q);
  }

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);

  const totalArticles = laws.data?.reduce((s, l) => s + l.articles, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <p className="text-sm text-text-2">
          اسأل عن الأنظمة العقارية السعودية، والإجابة من نصوص الأنظمة الرسمية مع ذكر النظام ورقم المادة
          {laws.data ? <> · المكتبة: {fmt(laws.data.length)} نظاماً و{fmt(totalArticles)} مادة</> : null}
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
        {/* conversation */}
        <Card className="flex min-h-[560px] flex-col">
          <div className="flex-1 space-y-6 p-5">
            {turns.length === 0 ? (
              <div className="grid place-items-center gap-4 py-10 text-center">
                <div className="grid size-14 place-items-center rounded-2xl bg-gold-soft text-2xl text-gold-d"><i className="ti ti-scale" aria-hidden /></div>
                <div>
                  <div className="font-bold text-heading">بماذا أساعدك؟</div>
                  <p className="text-sm text-text-3">جرّب أحد هذه الأسئلة أو اكتب سؤالك</p>
                </div>
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="rounded-full border border-border-md bg-surface px-3 py-1.5 text-sm text-text-2 hover:border-gold hover:text-heading">{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) => <Exchange key={i} turn={t} />)
            )}
            <div ref={bottom} />
          </div>

          <form className="border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <div className="flex items-end gap-2">
              <Textarea rows={2} maxLength={500} value={input} placeholder="اكتب سؤالك… مثل: متى يستحق الوسيط العمولة؟" className="flex-1 resize-none"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
              <Button type="submit" variant="primary" disabled={ask.isPending || input.trim().length < 3}>
                {ask.isPending ? <Spinner /> : <><i className="ti ti-send" aria-hidden /> إرسال</>}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-text-3">إجابات استرشادية من نصوص الأنظمة، وليست استشارة قانونية.</p>
          </form>
        </Card>

        {/* library and recent questions */}
        <div className="space-y-4">
          <Card>
            <CardHeader><span className="font-bold text-heading">المكتبة</span><span className="text-xs text-text-3">المصدر الرسمي</span></CardHeader>
            <CardBody className="max-h-[340px] space-y-1 overflow-y-auto p-2">
              <QueryView q={laws} errorLine="تعذّر تحميل المكتبة" loading={<CenteredSpinner className="py-6" />} empty={<EmptyLine className="py-6">لا توجد أنظمة بعد</EmptyLine>}>
                {(list) => list.map((l) => (
                  <a key={l.id} href={l.sourceUrl} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-row-hover">
                    <span className="text-text-2">{l.title}</span>
                    <span className="shrink-0 text-[11px] text-text-3">{fmt(l.articles)} مادة</span>
                  </a>
                ))}
              </QueryView>
            </CardBody>
          </Card>
          {history.data?.length ? (
            <Card>
              <CardHeader><span className="font-bold text-heading">آخر أسئلتك</span></CardHeader>
              <CardBody className="space-y-1 p-2">
                {history.data.map((h) => (
                  <button key={h.id} onClick={() => setInput(h.question)}
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-start text-sm text-text-2 hover:bg-row-hover">{h.question}</button>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Exchange({ turn }: { turn: Turn }) {
  const a = turn.a;
  const cited = a?.sources.filter((s) => s.cited) ?? [];
  const others = a?.sources.filter((s) => !s.cited) ?? [];
  return (
    <div className="space-y-3">
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-ink px-4 py-2.5 text-sm text-white">{turn.q}</div>
      </div>

      {turn.error ? <Note tone="danger">{turn.error}</Note> : !a ? (
        <div className="flex items-center gap-2 text-sm text-text-3"><Spinner /> أبحث في نصوص الأنظمة…</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl rounded-se-sm border border-border bg-surface-2 px-4 py-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-bold text-gold-d">
              <i className="ti ti-scale" aria-hidden /> إجادة القانونية
              {a.provider !== "anthropic" ? <Badge tone="default">تجريبي</Badge> : null}
            </div>
            <AnswerText text={a.answer} />
          </div>
          {cited.length ? <div className="grid gap-2">{cited.map((s) => <SourceCard key={s.id} s={s} />)}</div> : null}
          {others.length ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-bold text-text-3 hover:text-heading">
                <i className="ti ti-chevron-down transition group-open:rotate-180" aria-hidden /> مواد أخرى ذات صلة ({others.length})
              </summary>
              <div className="mt-2 grid gap-2">{others.map((s) => <SourceCard key={s.id} s={s} />)}</div>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Answer text with [n] markers shown as small numbered chips. */
function AnswerText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-7 text-text">
      {text.split("\n").map((line, i) => (
        <p key={i} className={cn(!line.trim() && "h-2")}>
          {line.split(/(\[\d+\])/).map((part, j) => {
            const m = part.match(/^\[(\d+)\]$/);
            return m ? <span key={j} className="mx-0.5 inline-grid size-5 place-items-center rounded-full bg-gold-soft align-middle text-[10px] font-bold text-gold-d">{m[1]}</span> : part;
          })}
        </p>
      ))}
    </div>
  );
}

function SourceCard({ s }: { s: LegalSource }) {
  const [open, setOpen] = useState(false);
  const long = s.text.length > 320;
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-5 place-items-center rounded-full bg-gold-soft text-[10px] font-bold text-gold-d">{s.number}</span>
        <span className="text-sm font-bold text-heading">{s.title}</span>
        <span className="text-sm text-text-2">· {s.label}</span>
        {s.amendments.length ? <Badge tone="warning">معدّلة</Badge> : null}
        <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="ms-auto text-xs text-text-3 hover:text-heading">
          المصدر <i className="ti ti-external-link" aria-hidden />
        </a>
      </div>
      {s.chapter ? <div className="mt-0.5 text-[11px] text-text-3">{s.chapter}</div> : null}
      <p className={cn("mt-2 whitespace-pre-line text-sm leading-7 text-text-2", !open && long && "line-clamp-4")}>{s.text}</p>
      {s.amendments.length ? (
        <div className="mt-2 space-y-1 rounded-lg bg-warning-bg p-2 text-xs leading-6 text-amber-text">
          {s.amendments.map((am, i) => <p key={i} className={cn(!open && "line-clamp-3")}>{am}</p>)}
        </div>
      ) : null}
      {long || s.amendments.length ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="mt-1 text-xs font-bold text-gold-d hover:underline">{open ? "عرض أقل" : "النص كاملاً"}</button>
      ) : null}
    </div>
  );
}
