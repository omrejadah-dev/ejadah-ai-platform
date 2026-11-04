/** Shared display formatters: Latin digits, Gregorian calendar, Arabic month/day names. */

/** Gregorian dates with Latin digits and Arabic month names. */
const LOCALE = "ar-SA-u-nu-latn-ca-gregory";

/** 12,345 — Latin digits with thousands separators; "—" when there is no value. */
export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);

/** Date and time, e.g. "4 نوفمبر 2026، 10:30 ص". */
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Date only. */
export const dateOnly = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(LOCALE, { dateStyle: "medium" }) : "—";

/** Weekday, day and month, e.g. "الأربعاء، 4 نوفمبر" (admin daily charts). */
const DAY_NAME = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" });
export const dayName = (ymd: string) => DAY_NAME.format(new Date(ymd + "T00:00:00"));

/** +9665XXXXXXXX → 05XXXXXXXX, the way people read and type it. */
export const localPhone = (p: string | null | undefined) => (p ? p.replace(/^\+966/, "0") : "—");
