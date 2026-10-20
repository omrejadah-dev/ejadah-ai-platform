import { toLatinDigits } from "./arabic-digits";

/** Excel often pastes the first cell only — strip trailing columns / rows. */
function firstPasteCell(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const firstLine = trimmed.split(/\r?\n/)[0] ?? trimmed;
  return (firstLine.split("\t")[0] ?? firstLine).trim();
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

function toIsoDate(y: number, m: number, d: number): string | null {
  const year = expandYear(y);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(year, m - 1, d);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseSlashOrDash(parts: [number, number, number]): string | null {
  let [a, b, c] = parts;
  c = expandYear(c);

  // YYYY-MM-DD (also after normalize)
  if (a >= 1000) {
    return toIsoDate(a, b, c);
  }

  // Prefer DD/MM/YYYY (Saudi / Excel regional default here).
  if (a > 12 && b <= 12) return toIsoDate(c, b, a);
  if (b > 12 && a <= 12) return toIsoDate(c, a, b);
  return toIsoDate(c, b, a);
}

/** Excel serial (1900 date system) → ISO when the paste is numeric only. */
function parseExcelSerial(raw: string): string | null {
  if (!/^\d+$/.test(raw)) return null;
  const serial = Number(raw);
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return null;
  // 1899-12-30 UTC + serial days (Excel 1900 leap bug not needed for modern dates).
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  const dt = new Date(ms);
  return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Parse clipboard text (Excel, Sheets, plain text) into `YYYY-MM-DD`
 * for `<input type="date">`. Returns null when unrecognized.
 */
export function parsePastedDate(text: string): string | null {
  const cell = firstPasteCell(toLatinDigits(text));
  if (!cell) return null;

  const datePart = (cell.split(/\s+/)[0] ?? cell).trim();
  if (!datePart) return null;

  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(datePart);
  if (isoMatch) {
    return toIsoDate(+isoMatch[1], +isoMatch[2], +isoMatch[3]);
  }

  const sepMatch = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/.exec(datePart);
  if (sepMatch) {
    return parseSlashOrDash([+sepMatch[1], +sepMatch[2], +sepMatch[3]]);
  }

  return parseExcelSerial(datePart);
}

/** Apply parsed ISO to a date input and notify React controlled handlers. */
export function applyIsoDateToInput(input: HTMLInputElement, iso: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, iso);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
