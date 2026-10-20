const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/**
 * Convert Eastern Arabic (٠-٩) and Persian (۰-۹) digits to Latin — guarded:
 * any char outside those ranges passes through.
 */
export function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (ch) => {
    const i = ARABIC_DIGITS.indexOf(ch);
    return String(i >= 0 ? i : PERSIAN_DIGITS.indexOf(ch));
  });
}

/** Latin digits (0-9) → Eastern Arabic (٠-٩); everything else passes through. */
export function toArabicDigits(value: string): string {
  return value.replace(/[0-9]/g, (ch) => ARABIC_DIGITS[Number(ch)]!);
}
