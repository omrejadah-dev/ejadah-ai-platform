/** Shared layout rhythm — matches active-transaction queue pages. */
export const pageGutterClassName = "px-4";

export const pageBodyClassName =
  "min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

export const pageShellHeaderClassName =
  "grid items-center gap-1 border-b border-border bg-gradient-to-br from-surface-2 to-surface px-4 py-2.5";

export const pageToolbarClassName =
  "flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-2.5";

/** KPI-style canvas — light gray background with padded content rhythm.
 *  Height follows content (no nested scroll); the shell `#content` scrolls the page.
 *  Avoid flex-1 / min-h fill so short pages don't leave a tall empty white panel. */
export const operationalPageBodyClassName =
  "flex h-fit w-full min-w-0 max-w-full flex-col gap-2.5 overflow-x-clip bg-bg px-4 py-3 sm:gap-3 sm:py-4";

/** White content panel on the operational canvas (tables, toolbars, forms). */
export const operationalPanelClassName =
  "flex h-fit w-full min-w-0 max-w-full flex-col overflow-x-clip rounded-[var(--radius-lg)] border border-border bg-surface shadow-none";

export const emptyStateClassName = "px-4 py-4 text-center";

/** Stats row flush with queue tables — full width, shared dividers. */
export const statGridFlushClassName =
  "mb-0 gap-0 divide-x divide-y divide-border sm:divide-y-0";

export const statCardFlushClassName =
  "rounded-none border-0 border-b-0 border-t-[3px] shadow-none";

/** Interactive queue / PO table rows (active transactions, bourse, government review). */
export const queueTableRowClassName =
  "cursor-pointer transition-[background-color,box-shadow,transform,opacity] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--info-bg)_40%,var(--surface))] active:scale-[0.997]";

/* Gold bar on the start edge (right in RTL) — marks which row is open in the panel. */
export const queueTableRowActiveClassName =
  "bg-[color-mix(in_srgb,var(--warning-bg)_45%,var(--surface))] shadow-[inset_-3px_0_0_0_var(--gold-d)]";

export const queueTableWrapClassName = "w-full min-w-0 overflow-x-auto";

export const queueTableHintClassName =
  "m-0 px-4 py-2 pb-3 text-[12px] text-text-3";
