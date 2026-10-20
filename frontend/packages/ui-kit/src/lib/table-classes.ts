/**
 * Single table design contract for the product.
 * Defaults live here; pass `className` on Table/Th/Td to override (conflict-aware merge).
 */

/** Align / size / weight utilities that should last-write-wins when overriding. */
function conflictKey(token: string): string | null {
  const bare = token.replace(/^!/, "");
  if (/^text-(start|end|center|left|right|justify)$/.test(bare)) return "text-align";
  if (/^text-\[/.test(bare) || /^text-(xs|sm|base|lg|xl|\d)/.test(bare)) {
    return "text-size";
  }
  if (
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(
      bare,
    )
  ) {
    return "font-weight";
  }
  if (bare === "table-auto" || bare === "table-fixed") return "table-layout";
  if (/^justify-/.test(bare)) return "justify";
  if (/^items-/.test(bare)) return "items";
  if (/^self-/.test(bare)) return "self";
  if (/^align-/.test(bare)) return "align";
  if (/^whitespace-/.test(bare)) return "whitespace";
  if (/^opacity-/.test(bare)) return "opacity";
  if (/^bg-/.test(bare)) return "bg";
  if (bare === "border-b" || bare.startsWith("border-b-")) return "border-b";
  if (bare === "border-t" || bare.startsWith("border-t-")) return "border-t";
  if (bare.startsWith("px-")) return "px";
  if (bare.startsWith("py-")) return "py";
  if (bare.startsWith("ps-")) return "ps";
  if (bare.startsWith("pe-")) return "pe";
  if (bare.startsWith("pt-")) return "pt";
  if (bare.startsWith("pb-")) return "pb";
  if (bare.startsWith("min-w-")) return "min-w";
  if (bare.startsWith("max-w-")) return "max-w";
  if (bare.startsWith("w-")) return "w";
  return null;
}

/**
 * Join class strings with last-wins for conflicting utilities so
 * `cx(thClassName, "text-center")` centers instead of fighting `text-start`.
 */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  const tokens: { key: string; value: string }[] = [];
  let unique = 0;
  for (const part of parts) {
    if (!part) continue;
    for (const raw of part.split(/\s+/)) {
      if (!raw) continue;
      const key = conflictKey(raw) ?? `u:${unique++}`;
      const idx = key.startsWith("u:")
        ? -1
        : tokens.findIndex((t) => t.key === key);
      if (idx >= 0) tokens[idx] = { key, value: raw };
      else tokens.push({ key, value: raw });
    }
  }
  return tokens.map((t) => t.value).join(" ");
}

/** Card chrome around a table (letter / ops look). */
export const tableFrameClassName =
  "overflow-hidden rounded-[14px] border border-border bg-surface shadow-card";

/** Scroll wrapper inside the frame (or standalone). */
export const tableWrapClassName = "min-w-0 overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch]";

export const tableClassName = "w-full border-collapse font-sans table-auto";

export const thClassName = "sticky top-0 z-[1] border-b-2 border-gold bg-surface-2 px-4 py-2 text-start text-[13px] font-medium text-text-2 whitespace-nowrap";

export const tdClassName = "border-b border-border px-4 py-2 text-start text-[13px] text-text align-middle";

/** Cell content that reads as a link — thin gold underline, navy text. */
export const tdLinkClassName = "font-medium text-ink border-b border-gold/55 hover:border-gold";

/** Inline LTR value (PO, dates, amounts) — cell stays RTL-start aligned. */
export const tdLtrValueClassName = "inline-block tabular-nums text-start [unicode-bidi:isolate]";

export const thActionClassName = "sticky top-0 z-[1] w-12 border-b-2 border-gold bg-surface-2 px-4 py-2 text-center text-[13px] font-medium text-text-2 whitespace-nowrap";

export const tdActionClassName = "w-12 border-b border-border px-4 py-1.5 text-center align-middle";

/** 36px rows; pass `density="dense"` on `Table` for 32px + odd-row striping. */
export const trHeightClassName = "h-9 group-data-[density=dense]:h-8";

export const trStripeClassName = "group-data-[density=dense]:odd:bg-surface-2";

export const trSelectedClassName = "data-[selected]:[&_td]:bg-gold-soft";

export const trHoverClassName = "[&_td]:transition-colors [&_td]:duration-200 [&:hover_td]:bg-row-hover [&:hover_td]:cursor-pointer";