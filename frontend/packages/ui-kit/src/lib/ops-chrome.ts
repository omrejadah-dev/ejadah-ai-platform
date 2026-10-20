/**
 * Shared ops UI chrome — letter cards, form fields, toolbar, ink/ghost buttons.
 * Prefer these over per-MFE copies (`ops-tasks-tw`, `settings-ops-tw`, `finance-tw` buttons).
 * Aligns with `Button` (`primary` / `default`) and `tableFrameClassName`.
 */

import { tableFrameClassName } from "./table-classes";

/** Ink primary — matches `Button variant="primary" size="default"`. */
export const opsBtnPrimary =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[9px] border-none bg-ink px-[18px] py-2.5 font-[inherit] text-[13px] font-bold text-white transition-colors enabled:hover:bg-navy-3 disabled:cursor-not-allowed disabled:opacity-55";

/** Surface ghost — matches `Button variant="default" size="default"`. */
export const opsBtnGhost =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-border-md bg-surface px-[18px] py-2.5 font-[inherit] text-[13px] font-semibold text-text-2 transition-colors enabled:hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-50";

export const opsBtnSm =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-border-md bg-surface px-3 py-1.5 font-[inherit] text-[12.5px] font-semibold text-text-2 transition-colors enabled:hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-50";

export const opsBtnSmPrimary =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-none bg-ink px-3 py-1.5 font-[inherit] text-[12.5px] font-bold text-white transition-colors enabled:hover:bg-navy-3 disabled:cursor-not-allowed disabled:opacity-55";

/** Sticky mobile action bar under task/settings forms. */
export const opsTfActions =
  "mt-5 flex flex-wrap gap-2.5 max-lg:sticky max-lg:bottom-0 max-lg:z-20 max-lg:-mx-4 max-lg:mt-6 max-lg:border-t max-lg:border-border max-lg:bg-surface/95 max-lg:px-4 max-lg:py-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:backdrop-blur-sm max-lg:[&>button]:min-w-[calc(50%-0.35rem)] max-lg:[&>button]:flex-1 max-lg:[&>button]:justify-center sm:mx-0";

/** Compact actions row (settings dialogs). */
export const opsTfActionsInline =
  "mt-[18px] flex flex-wrap items-center gap-2.5";

export const opsTfLbl = "mb-[7px] block text-xs font-semibold text-text-2";

export const opsTfNote =
  "rounded-[10px] border border-dashed border-border-md bg-surface-2 px-3.5 py-3 text-[12.5px] leading-[1.7] text-text-3";

/** Larger dashed panel note (keys empty panels). */
export const opsPanelNote =
  "rounded-xl border border-dashed border-border-md bg-surface px-[26px] py-[26px] text-center text-[13px] text-text-3";

export const opsFormGrid =
  "grid grid-cols-1 gap-3.5 min-[561px]:grid-cols-2";

export const opsFld = "flex min-w-0 flex-col gap-1.5";

export const opsFldFull = "col-span-full flex min-w-0 flex-col gap-1.5";

/** Ops cream field — gold focus ring (also see `formControlClassName` for white fill). */
export const opsFldControl =
  "w-full rounded-[9px] border border-border-md bg-surface-2 px-3 py-[9px] font-[inherit] text-[13px] text-text outline-none transition-[border-color,box-shadow] focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_20%,transparent)]";

export const opsFldTextarea = `${opsFldControl} min-h-[62px] resize-y`;

/** Search input with leading-icon inset (ps-9). */
export const opsSearchInput = `${opsFldControl} min-h-[38px] pe-3.5 ps-9 leading-none placeholder:text-text-3`;

export const opsCheckInput =
  "m-0 h-[17px] w-[17px] shrink-0 cursor-pointer accent-gold-d";

/** Soft labeled value cell (Case Study `ENG_BOX`). */
export const opsFieldBox =
  "rounded-lg border border-border bg-surface-2 px-3 py-2.5";

/** Bare surface panel — prefer over raw border + shadow-card strings. */
export const opsPanelCard =
  "rounded-[14px] border border-border bg-surface shadow-card";

/** Border + surface card (padding added by caller). */
export const opsSurfaceCard = opsPanelCard;

/** Workspace section card (evaluator / engineering). */
export const opsWorkspaceCard = `${opsPanelCard} p-[18px_20px]`;

/** Padded work panel (finance work blocks, etc.). */
export const opsWorkCard = `${opsPanelCard} px-[18px] py-4`;

/** Dashboard / keys padded card. */
export const opsDashCard = `${opsPanelCard} px-5 py-[18px]`;

/** Property / envelope / failure summary head card. */
export const opsPpHeadCard =
  `mb-3.5 ${opsPanelCard} px-4 py-4 sm:px-[22px] sm:py-[18px]`;

/** Workspace body panel (property tabs, case-study work). */
export const opsContentPanel =
  `min-w-0 overflow-hidden ${opsPanelCard} px-5 pb-5`;

/** Floating overlay (map drawers / elevated popovers) — `shadow-lg` not card shadow. */
export const opsFloatPanel =
  "overflow-hidden rounded-[14px] border border-border bg-surface shadow-lg";

/** Nested / inset block (cream surface-2, no elevation). */
export const opsInsetPanel =
  "rounded-[14px] border border-border bg-surface-2";

/** Pulse placeholder matching panel radius (set height via className). */
export const opsSkeletonCard =
  "animate-pulse rounded-[14px] border border-border bg-surface-2";

/** Tappable card surface (mobile lists) — pad/layout via `cn`. */
export const opsTapCard = `${opsPanelCard} cursor-pointer text-start transition-colors active:bg-row-hover`;

/** Hover lift used by KPI / interactive dash tiles. */
export const opsTapElevated =
  "transition-[border-color,box-shadow,transform] duration-150 hover:border-border-md hover:shadow-[0_4px_14px_rgba(15,52,96,0.09)] active:translate-y-px";

/** Soft elevation used by mobile queue / fee cards (overrides `shadow-card`). */
export const opsMobileShadow = "shadow-[0_2px_8px_rgba(15,52,96,0.06)]";

/** Mobile list/fee card chrome (tone border via `cn`). */
export const opsMobileCard = `rounded-[14px] border border-border bg-surface px-3.5 py-3.5 ${opsMobileShadow}`;

/** Compact dashed empty hint (evaluator / map placeholders). */
export const opsEmptyHint =
  "rounded-lg border border-dashed border-border-md bg-surface px-3 py-4 text-center text-[12px] text-text-3";

/** Dashed upload / drop target frame. */
export const opsDropzone =
  "grid place-items-center rounded-lg border border-dashed border-border-md bg-surface-2";

/** Compact gold chip (counts, tags). */
export const opsChip =
  "inline-flex items-center gap-1 rounded-md bg-gold-soft px-2.5 py-[3px] text-[12px] font-bold text-gold-d";

/** Gold accent CTA (remind / collect). */
export const opsAccentBtn =
  "inline-flex items-center justify-center gap-2 rounded-[9px] border-none bg-gold-d px-[18px] py-2.5 font-[inherit] text-[13px] font-bold text-white shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--gold-d)_60%,transparent)] transition-[background,transform] duration-150 enabled:hover:-translate-y-px enabled:hover:bg-gold disabled:cursor-not-allowed disabled:opacity-55";

export const opsAccentBtnSm =
  "inline-flex h-8 cursor-pointer items-center gap-2 rounded-[9px] border-none bg-gold-d px-3.5 text-[12px] font-bold text-white shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--gold-d)_60%,transparent)] transition-[background,transform] hover:enabled:-translate-y-px hover:enabled:bg-gold disabled:opacity-60";

export const opsToolbar =
  "mb-3.5 flex flex-wrap items-center justify-between gap-4 max-lg:mb-3 max-lg:flex-col max-lg:items-stretch max-lg:gap-2.5";

export const opsFilters =
  "flex flex-wrap items-center gap-2.5 max-lg:w-full max-lg:flex-col max-lg:items-stretch";

export const opsListCount =
  "inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-gold-soft px-2.5 py-[3px] text-[12px] font-bold text-gold-d max-lg:ms-0 lg:ms-auto";

/** Pill badge (text label). */
export const opsPpBadge =
  "inline-flex items-center rounded-md bg-gold-soft px-[11px] py-[3px] text-xs font-bold text-gold-d";

/** Round count badge. */
export const opsCountBadge =
  "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-gold-soft px-1.5 text-[12px] font-bold text-gold-d";

export const opsIconBoxGold =
  "grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold-soft text-gold-d";

/** Same chrome as `TableFrame` / letter panels. */
export const opsLetterCard = tableFrameClassName;

export const opsLetterHead =
  "flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-3.5 py-3.5 max-lg:flex-col max-lg:items-stretch sm:px-[18px] sm:py-[15px]";

export const opsLetterTitle = "text-[13.5px] font-extrabold text-heading";

export const opsLetterSub = "text-[12px] leading-relaxed text-text-3";

export const opsLetterMeta = "text-[12px] font-semibold text-text-3";

const opsTfSegBase = "cursor-pointer border px-[15px] py-[9px] font-[inherit] text-[12.5px] font-semibold transition-[background-color,color,border-color] duration-200 ease-out motion-reduce:transition-none first:rounded-s-[9px] last:rounded-e-[9px] not-first:border-s-0";

export const opsTfSeg = `${opsTfSegBase} border-border-md bg-surface-2 text-text-2 hover:bg-row-hover hover:text-heading`;

export const opsTfSegActive = `${opsTfSegBase} border-ink bg-ink text-white`;

export const opsTfSegRow = "inline-flex flex-wrap";

export const opsModalClose = "grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[9px] border-none bg-surface-2 p-0 font-[inherit] text-[15px] leading-none text-text-2 transition-[background,color] hover:bg-row-hover hover:text-heading";

export const opsModalFooter = "flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-border bg-surface-2 px-4 py-3.5 max-lg:sticky max-lg:bottom-0 max-lg:pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-[22px]";
