import type { Me } from "./api";

export const confidenceTone = (c: string) =>
  (c === "high" ? "success" : c === "medium" ? "warning" : c === "low" ? "default" : "danger") as "success" | "warning" | "default" | "danger";

export const ROLE_LABEL: Record<Me["role"], string> = {
  broker: "وسيط", office: "مكتب عقاري", investor: "مستثمر", developer: "مطوّر", admin: "مدير النظام",
};
