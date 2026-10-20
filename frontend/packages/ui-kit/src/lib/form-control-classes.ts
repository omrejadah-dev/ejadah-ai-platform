/**
 * Shared field chrome — matched to government / ops task fields
 * (`opsFldControl`: 9px, cream fill, gold focus ring).
 */
/**
 * Shared height/border/focus chrome for `Input`/`Select`/`Textarea`. A
 * computed value the user can't edit is `readOnly` (renders `bg-bg`, stays
 * selectable/copyable) — reserve `disabled` for a control that's genuinely
 * unavailable right now, not for "this field fills itself in".
 */
export const formControlClassName =
  "box-border h-[38px] w-full rounded-[9px] border border-border-md bg-surface px-3 py-0 font-[inherit] text-[13px] text-text outline-none shadow-none transition-[border-color,box-shadow] placeholder:text-text-3 focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_20%,transparent)] focus:ring-0 read-only:cursor-default read-only:bg-bg read-only:focus:border-border-md read-only:focus:shadow-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60";

export const formControlErrorClassName =
  "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(226,75,74,0.12)]";
