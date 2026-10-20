/**
 * Page-load copy that should not flash on a fast cached fetch.
 * Matches «جاري التحميل…», «جاري تحميل الإعدادات…», etc.
 */
export function isGentleLoadingCopy(value: unknown): boolean {
  return typeof value === "string" && /^جاري\s/.test(value.trim());
}
