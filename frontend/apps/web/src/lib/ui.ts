import type { Me, PropertyType } from "./api";

export const confidenceTone = (c: string) =>
  (c === "high" ? "success" : c === "medium" ? "warning" : c === "low" ? "default" : "danger") as "success" | "warning" | "default" | "danger";

/** Tabler icon per property type: the type tiles on the pricing page and the cards in «تسعيراتي». */
/** Below this many deals in 12 months a district median for a type is thin (pricing panel, market comparison). */
export const THIN_DEALS = 30;

export const TYPE_ICON: Record<PropertyType, string> = { land: "ti-map-2", villa: "ti-home", apartment: "ti-building", building: "ti-building-skyscraper" };

/** Two letters for an avatar: the first letter of the first two words, skipping «ال» («محمد القحطاني» → «مق»). */
export const initials = (name: string | null | undefined) =>
  (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.replace(/^ال(?=.)/, "")[0]).join("") || "؟";

export const ROLE_LABEL: Record<Me["role"], string> = {
  broker: "وسيط", investor: "مستثمر", developer: "مطوّر", admin: "مدير النظام",
};
