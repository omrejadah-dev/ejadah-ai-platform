# @platform/ui-kit

Ejadah's design system for an Arabic/RTL real-estate valuation platform (Tajawal typeface, navy + gold brand).

## Using it

**Wrapping.** No required root provider for most components — `Button`, `Card`, `Table`, `Badge`, etc. render standalone. Two exceptions:
- Always wrap your page root in `dir="rtl" lang="ar"` — components assume an RTL ambient context (e.g. `TdLtr`/`LtrCode` explicitly *counteract* RTL for numbers/codes, which only makes sense inside an RTL page).
- If you use the `useToast()`/`useOptionalToast()` hooks, wrap the tree in `<ToastProvider>` first — toasts render through it, not standalone.

**Styling idiom: Tailwind v4 utility classes on real design tokens — never invent new color/spacing names.** Compose with these (defined in `src/styles/tokens.css`, mapped through the app's Tailwind `@theme`):

| Purpose | Classes |
|---|---|
| Surfaces | `bg-bg` (page), `bg-surface` (card), `bg-surface-2` (subtle panel/header) |
| Text | `text-text` (body), `text-text-2` (secondary), `text-text-3` (muted) |
| Borders | `border-border`, `border-border-md` |
| Brand | `bg-ink`/`text-ink` (navy — primary actions), `bg-gold`/`text-gold`/`bg-gold-d` (accent) |
| Status | `bg-danger-bg`/`text-danger-text`, `bg-success-bg`/`text-success-text`, `bg-warning-bg`/`text-amber-text`, `bg-info-bg`/`text-info-text` |
| Shape/elevation | `rounded` (default radius), `rounded-lg`, `rounded-sm`, `shadow-card`, `shadow-modal` |

Merge conditional classes with the shipped `cn()` helper (`import { cn } from "@platform/ui-kit"`), not template strings.

**Where the truth lives.** `src/styles/tokens.css` is the token source of truth — don't guess a color name, grep it there. Each component's own JSDoc comment (visible on hover in your editor) documents its role and any non-obvious prop.

```tsx
import { Badge, Button, Card, CardBody, CardHeader } from "@platform/ui-kit";

<div dir="rtl" lang="ar">
  <Card style={{ maxWidth: 380 }}>
    <CardHeader>
      <strong style={{ fontSize: 14 }}>بيانات الصك</strong>
      <Badge tone="success">مكتمل</Badge>
    </CardHeader>
    <CardBody>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>
        رقم الصك 88120044991 — صادر بتاريخ 1445/03/12هـ.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <Button variant="ghost" size="sm">إلغاء</Button>
        <Button variant="primary" size="sm">اعتماد</Button>
      </div>
    </CardBody>
  </Card>
</div>
```

**Notable brand-palette quirk**: `--success` maps to navy (`--ink`), not green — Ejadah's "success"/"complete" state is brand navy, not a literal green. Don't second-guess a navy "complete" badge/progress bar as a bug.

---

## Brand book (approved 2026-09-17)

### The three contexts — pick the family first

| Context | Family token | Typeface | Use it for |
| --- | --- | --- | --- |
| Apps | `app` (= `sans`) | Tajawal 400/500/700/800 | Every screen of the operations platform, dashboards, portals, prototypes of them |
| Reports | `report` | IBM Plex Sans Arabic 400/500 (+ IBM Plex Sans for Latin) | Quotations «عروض الأسعار», proposals, slide decks, one-pagers, PDF reports |
| Letters | `letter` | Sakkal Majalla 400/700 | Official correspondence on the letterhead, memos, certificates |

Decide the context from the deliverable, never mix families in one artifact. Colour, spacing, radii and iconography are shared by all three.

### Content fundamentals

- Write formal, operational Arabic. Imperative labels («حفظ المعاملة», «إعادة المحاولة»), no pleasantries, no exclamation marks. Address the user in the second person, politely and directly; hints are short: «ستظهر المعاملات الجديدة هنا فور إسنادها».
- Keep the status vocabulary fixed: جديد / قيد التنفيذ / قيد الدراسة / قيد المراجعة / مكتمل / متعذر / معتمد / معلّق / ناقص / محذوف. Say «متعذر» (obstructed), never «فشل». Render them with `StatusBadge`.
- Errors are calm and actionable: «تعذّر تنفيذ العملية — حاول مرة أخرى». Loading reads «جاري التحميل»; progress toasts go «جارٍ الحفظ…» then «تم حفظ المعاملة».
- Latin only for reference codes (`EJ-2026-0412`), bank names, and finance terms (`DSCR`): wrap them in `.lat`/a monospace-ish class and `<bdi>`. Counts and dates in Latin digits with `tabular-nums`.
- No emoji anywhere. Icons are stroked SVGs.

### Visual foundations

**Colour.** Deep navy `ink` #102b4e is the brand: sidebar, primary buttons, toasts, headings. Muted gold `gold` #a4906f is the accent — decorative only: active states, focus border, the 2px table-header underline and 3px accent rails. Gold is never a text colour and never a button fill; text that must read gold uses `gold-d`. Pages sit on warm cream `bg` #f5f3ee with white `surface` panels and `surface-2` headers. Semantic colours: **success is navy** (`success` = `ink`, never green), `warning` amber, `danger` terracotta `red`, `info` blue. Fills use the light `*-bg`/`*-light` washes, labels the dark `*-text`. Dark theme (`data-theme="dark"`): deep slate surfaces, brightened gold, translucent semantic washes.

**Type.** Arabic line-height ≥ 1.6, minimum 12px, no letter-spacing on Arabic, `tabular-nums` on numeric columns. App scale: page-title 20 / section-title 17 / body 14 / label 13 / hint 12, stat values 24 and KPI 32 extrabold.

**Layout.** Fixed 260px navy sidebar (72px collapsed rail), 66px topbar, 42px tab strip; content on the cream canvas with page gutters; internal gaps from the spacing scale (4/8/12/16/24); white panels at 12px radius with a 1px border, mostly flat.

**Buttons.** One height for every control: 38px (`Button`, fields, toolbar) — 32px `sm`, 44px `lg`; label 14px at weight 500. `primary` (navy) is the one main action per view and carries a 16px stroked glyph before its label (check, plus, upload); `default`/`outline` secondary with the grey hairline (never navy), `ghost` quiet, `danger` destructive; `accent` (gold fill) is deprecated. Every control shows a 3px gold `focus-visible` ring.

**Tables and lists.** 36px rows (32px dense), header label weight 500 on `surface-2` with the gold underline, sticky in a scrolling wrap; one key column in `heading` weight 500; numbers end-aligned with `tabular-nums`; status is a `StatusBadge` in the last column, which inside lists renders as an equal-size filled chip so the column aligns; never a row fill. Below 900px the row becomes a card with a status-coloured rail. Every queue opens with a filter bar (quick-filter chips for the most-asked statuses, the rest behind a "تصفية" side sheet) and swaps to a bulk-action bar while rows are selected. Every paged list ends in a footer: total first, page-of-N, no page-number strip, never "load more" internally.

**Radii.** 8px for controls, buttons, fields, badges; 12px for cards, panels, modals; 6px for small pieces. Full-round only for badge dots and nav counts.

**Shadows.** A whisper-quiet navy shadow on resting panels, a stronger one on menus, and the modal shadow on dialogs. No other elevation.

**Motion.** Enterprise-minimal: opacity/colour fades 120–280ms, no bounces, no route transitions; honour `prefers-reduced-motion`.

**Iconography.** Stroked inline SVGs only: 24×24 viewBox, stroke 1.8–2.2, round caps and joins, `currentColor`. No icon font, no PNG icons, no emoji.

## Components

See each component's own JSDoc for its role and props. Grouped by concern:

- **Core:** `Button`, `Badge`, `StatusBadge`, `StatusPill`, `Card`/`CardHeader`/`CardBody`, `Note`, `Spinner`, `Skeleton`
- **Forms:** `Input`, `Select`, `Textarea`, `Label`, `FormGroup`, `FormRow`, `InfathTextField`/`InfathSelectField`/`InfathTextAreaField`/`InfathSection`
- **Data:** `Table` (+ `TableFrame`/`THead`/`TBody`/`Tr`/`Th`/`Td`/`TdLtr`/`ThAction`/`TdAction`/`TableEmptyRow`), `StatCard`/`StatGrid`/`StatLabel`/`StatValue`, `KpiBand`/`KpiCell`, `ProgressBar`, `ListPager`
- **Navigation:** `TabBar`/`Tab`/`TabPanel`, `OperationalToolbarSearch`/`OperationalToolbarSelect`/`OperationalToolbarPrimaryButton`
- **Feedback:** `AppModal` (+ the underlying `Modal*` pieces), `ToastProvider`/`useToast`, `EmptyState`
- **Layout:** `PageShell`/`PageGutter`/`PageShellHeader`/`PageToolbar`/`OperationalPanel`/`QueueTableHint`/`ReportPageBody`, `SubpagePanel`/`SubpageHeader`
