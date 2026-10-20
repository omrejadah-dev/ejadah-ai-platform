/** Operational toolbar — Tailwind (compact 38px, matches opsFldControl / opsBtnPrimary). */
export const operationalToolbarSearchWrapClassName =
  "relative flex w-[280px] max-w-[min(100%,340px)] flex-[1_1_280px] items-center max-lg:w-full max-lg:max-w-none max-lg:flex-[1_1_100%]";

export const operationalToolbarSearchIconClassName =
  "pointer-events-none absolute start-3 top-1/2 grid -translate-y-1/2 place-items-center text-text-3";

export const operationalToolbarSearchInputClassName =
  "box-border h-[38px] w-full rounded-[9px] border border-border-md bg-surface-2 py-0 ps-[38px] pe-3 font-[inherit] text-[13px] leading-[38px] text-text shadow-none outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-3 focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_20%,transparent)]";

export const operationalToolbarSelectWrapClassName =
  "relative flex shrink-0 items-center max-lg:min-w-0 max-lg:flex-[1_1_calc(50%-0.3125rem)]";

export const operationalToolbarSelectClassName =
  "box-border h-[38px] max-w-full cursor-pointer appearance-none rounded-[9px] border border-border-md bg-surface-2 py-0 ps-3 pe-[34px] font-[inherit] text-[13px] leading-[38px] text-text shadow-none outline-none transition-[border-color,box-shadow] duration-150 focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_20%,transparent)] max-lg:w-full";

export const operationalToolbarSelectCaretClassName =
  "pointer-events-none absolute end-[11px] top-1/2 grid -translate-y-1/2 place-items-center text-text-3";

export const operationalToolbarPrimaryButtonClassName =
  "box-border inline-flex h-[38px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[9px] border-0 bg-ink px-[18px] font-[inherit] text-sm font-medium text-white transition-[background-color,transform] duration-[130ms] hover:enabled:bg-navy-3 hover:enabled:-translate-y-px disabled:cursor-not-allowed disabled:opacity-55 max-lg:h-11 max-lg:w-full";
