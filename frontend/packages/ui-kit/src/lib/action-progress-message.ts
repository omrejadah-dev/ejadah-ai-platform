export const UPLOAD_PROGRESS_MESSAGE = "جاري الرفع…";
export const UPLOAD_SUCCESS_MESSAGE = "تم الرفع !";
export const UPLOAD_FAILURE_MESSAGE = "تعذّر رفع الملف — حاول مرة أخرى";

const EXACT_MESSAGES: Record<string, string> = {
  حفظ: "جاري الحفظ…",
  "حفظ أمر العمل": "جاري حفظ أمر العمل…",
  "حفظ التعديلات": "جاري حفظ التعديلات…",
  "حفظ وإرسال المعاينة": "جاري إرسال المعاينة…",
  "حفظ وإتمام المراجعة": "جاري إتمام المراجعة…",
  "حفظ وإتمام التقييم": "جاري إرسال التقييم…",
  "حفظ وإرسال الرفع": "جاري إرسال الرفع المساحي…",
  "حفظ وإكمال البورصة": "جاري حفظ بيانات البورصة…",
  "تأكيد التوزيع وإرسال المهام": "جاري تأكيد التوزيع وإرسال المهام…",
  "إرسال للأخصائي": "جاري إرسال التقييم للأخصائي…",
  "إرسال للمشرف — إدارة التعذرات": "جاري إرسال التعذّر للمشرف…",
  "حفظ والانتقال للتوزيع": "جاري الحفظ والانتقال للتوزيع…",
  "حفظ مسودة": "جاري حفظ المسودة…",
  "حفظ مسودة المعاينة": "جاري حفظ مسودة المعاينة…",
  "حفظ إجاباتي": "جاري حفظ الإجابات…",
  "حفظ الحقل": "جاري حفظ الحقل…",
  "حفظ الإسناد": "جاري حفظ الإسناد…",
  "تأكيد الحفظ": "جاري إنشاء الحساب…",
  "إصدار تقرير دراسة الحالة": "جاري إصدار تقرير دراسة الحالة…",
  "تأكيد مدخلات المعاين": "جاري تأكيد مدخلات المعاين…",
  "اعتماد مدخلات المعاين": "جاري تأكيد مدخلات المعاين…",
  "دخول": "جاري تسجيل الدخول…",
  "تسجيل الدخول": "جاري تسجيل الدخول…",
  "تسجيل الاستلام": "جاري تسجيل الاستلام…",
  "حفظ الملاحظة": "جاري حفظ الملاحظة…",
  "إرفاق صورة": "جاري إرفاق الصورة…",
  "حفظ تعذر داخلي": "جاري تسجيل التعذّر…",
  "تسجيل احتمال تعذر": "جاري تسجيل التعذّر…",
};

const KEYWORD_MESSAGES: { keyword: string; message: string }[] = [
  { keyword: "إرسال", message: "جاري الإرسال…" },
  { keyword: "حذف", message: "جاري الحذف…" },
  { keyword: "تأكيد", message: "جاري التأكيد…" },
  { keyword: "تحميل", message: "جاري التحميل…" },
  { keyword: "إضافة", message: "جاري الإضافة…" },
  { keyword: "إرفاق", message: "جاري الإرفاق…" },
  { keyword: "اعتماد", message: "جاري الاعتماد…" },
  { keyword: "حفظ", message: "جاري الحفظ…" },
  { keyword: "تسجيل", message: "جاري التسجيل…" },
  { keyword: "تحديث", message: "جاري التحديث…" },
  { keyword: "استيراد", message: "جاري الاستيراد…" },
  { keyword: "تنفيذ", message: "جاري التنفيذ…" },
  { keyword: "إنشاء", message: "جاري الإنشاء…" },
];

const SUCCESS_EXACT_MESSAGES: Record<string, string> = {
  حفظ: "تم الحفظ !",
  "حفظ أمر العمل": "تم حفظ أمر العمل !",
  "حفظ التعديلات": "تم حفظ التعديلات !",
  "حفظ وإرسال المعاينة": "تم إرسال المعاينة !",
  "حفظ وإتمام المراجعة": "تم إتمام المراجعة !",
  "حفظ وإتمام التقييم": "تم إرسال التقييم !",
  "حفظ وإرسال الرفع": "تم إرسال الرفع المساحي !",
  "حفظ وإكمال البورصة": "تم حفظ بيانات البورصة !",
  "تأكيد التوزيع وإرسال المهام": "تم تأكيد التوزيع وإرسال المهام !",
  "إرسال للأخصائي": "تم إرسال التقييم للأخصائي !",
  "إرسال للمشرف — إدارة التعذرات": "تم إرسال التعذّر للمشرف !",
  "حفظ والانتقال للتوزيع": "تم الحفظ والانتقال للتوزيع !",
  "حفظ مسودة": "تم حفظ المسودة !",
  "حفظ مسودة المعاينة": "تم حفظ مسودة المعاينة.",
  "حفظ إجاباتي": "تم حفظ الإجابات !",
  "حفظ الحقل": "تم حفظ الحقل !",
  "حفظ الإسناد": "تم حفظ الإسناد !",
  "تأكيد الحفظ": "تم إنشاء الحساب !",
  "إصدار تقرير دراسة الحالة": "تم إصدار تقرير دراسة الحالة !",
  "تأكيد مدخلات المعاين": "تم تأكيد مدخلات المعاين !",
  "اعتماد مدخلات المعاين": "تم تأكيد مدخلات المعاين !",
  "دخول": "تم تسجيل الدخول !",
  "تسجيل الدخول": "تم تسجيل الدخول !",
  "تسجيل الاستلام": "تم تسجيل الاستلام !",
  "حفظ الملاحظة": "تم حفظ الملاحظة !",
  "إرفاق صورة": "تم إرفاق الصورة !",
  "حفظ تعذر داخلي": "تم تسجيل التعذّر !",
  "تسجيل احتمال تعذر": "تم تسجيل التعذّر !",
  "تسجيل التعذر": "تم تسجيل التعذّر !",
};

const SUCCESS_KEYWORD_MESSAGES: { keyword: string; message: string }[] = [
  { keyword: "إرفاق", message: "تم الإرفاق !" },
  { keyword: "إرسال", message: "تم الإرسال !" },
  { keyword: "حذف", message: "تم الحذف !" },
  { keyword: "تأكيد", message: "تم التأكيد !" },
  { keyword: "تحميل", message: "تم التحميل !" },
  { keyword: "إضافة", message: "تمت الإضافة !" },
  { keyword: "اعتماد", message: "تم الاعتماد !" },
  { keyword: "حفظ", message: "تم الحفظ !" },
  { keyword: "تسجيل", message: "تم التسجيل !" },
  { keyword: "تحديث", message: "تم التحديث !" },
  { keyword: "استيراد", message: "تم الاستيراد !" },
  { keyword: "تنفيذ", message: "تم التنفيذ !" },
  { keyword: "إنشاء", message: "تم الإنشاء !" },
];

const SKIP_ACTION_LABELS = new Set([
  "إلغاء",
  "الغاء",
  "رجوع",
  "إغلاق",
  "رجوع للقائمة",
  "تخطي",
  "التالي",
  "السابق",
  "عرض",
  "معاينة",
  "تحرير",
  "⋮",
  "تسجيل تعذر",
  "تسجيل التعذر",
  "حفظ تعذر داخلي",
  "تسجيل احتمال تعذر",
  "حفظ مسودة المعاينة",
  "تسجيل الخروج",
  "تسجيل الاستلام",
  "حفظ وإرسال المعاينة",
  "حفظ وإتمام المراجعة",
  "حفظ وإتمام التقييم",
  "حفظ وإرسال الرفع",
  "اعتماد مدخلات المعاين",
  "تأكيد مدخلات المعاين",
  "تأكيد الاستلام",
  "إرسال للأخصائي",
  "ابدأ الرفع المساحي",
  "فتح المعاملة",
  "تفاصيل العقار",
  "دراسة العقار",
  "إسناد مهمة",
]);

/**
 * Lookup form of a button label: collapsed spaces, shadda dropped — so
 * «تسجيل التعذّر» and «تسجيل التعذر» hit the same rule.
 */
function normalizeActionLabel(label: string): string {
  return label.replace(/\s+/g, " ").replace(/ّ/g, "").trim();
}

/** Avoid broad keyword hits on longer phrases with dedicated exact/skip rules. */
function keywordMatchesLabel(keyword: string, label: string): boolean {
  if (!label.includes(keyword)) return false;
  if (keyword === "تسجيل") {
    if (
      label.includes("الدخول") ||
      label.includes("الخروج") ||
      label.includes("الاستلام") ||
      label.includes("التعذر") ||
      label.includes("احتمال")
    ) {
      return false;
    }
  }
  if (keyword === "حفظ") {
    if (label.includes("ملاحظة")) return false;
    if (label.includes("مسودة") && label.includes("معاينة")) return false;
  }
  return true;
}

/** Maps a button label to a short Arabic progress toast. */
export function progressMessageForActionLabel(actionLabel: string): string {
  const label = normalizeActionLabel(actionLabel);
  if (!label) return "جاري التنفيذ…";

  const exact = EXACT_MESSAGES[label];
  if (exact) return exact;

  for (const { keyword, message } of KEYWORD_MESSAGES) {
    if (keywordMatchesLabel(keyword, label)) return message;
  }

  return "جاري التنفيذ…";
}

/** Maps a button label to a short Arabic success toast after the action completes. */
export function successMessageForActionLabel(actionLabel: string): string {
  const label = normalizeActionLabel(actionLabel);
  if (!label) return "تم التنفيذ !";

  const exact = SUCCESS_EXACT_MESSAGES[label];
  if (exact) return exact;

  for (const { keyword, message } of SUCCESS_KEYWORD_MESSAGES) {
    if (keywordMatchesLabel(keyword, label)) return message;
  }

  return "تم التنفيذ !";
}

function isActionLikeLabel(actionLabel: string): boolean {
  const label = normalizeActionLabel(actionLabel);
  if (!label || SKIP_ACTION_LABELS.has(label)) return false;
  if (EXACT_MESSAGES[label]) return true;
  return KEYWORD_MESSAGES.some(({ keyword }) =>
    keywordMatchesLabel(keyword, label),
  );
}

function inferButtonVariant(element: HTMLElement): string {
  const explicit = element.getAttribute("data-button-variant");
  if (explicit) return explicit;

  const cls =
    typeof element.className === "string" ? element.className : "";
  if (
    cls.includes("bg-primary") ||
    (cls.includes("border-primary") && cls.includes("text-white"))
  ) {
    return "primary";
  }
  if (cls.includes("text-danger") || cls.includes("bg-danger")) {
    return "danger";
  }
  if (cls.includes("border-transparent") && cls.includes("bg-transparent")) {
    return "ghost";
  }
  return "default";
}

export function labelFromActionElement(element: HTMLElement): string {
  const custom = element.getAttribute("data-action-label")?.trim();
  if (custom) return custom;

  if (
    element instanceof HTMLInputElement &&
    (element.type === "submit" || element.type === "button")
  ) {
    return (element.value || "").replace(/\s+/g, " ").trim();
  }

  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function shouldShowGlobalActionToast(
  element: HTMLElement,
  label: string,
): boolean {
  if (element.closest("[data-no-action-toast]")) return false;
  if (element.hasAttribute("data-no-action-toast")) return false;
  if (element.closest('[role="tablist"]')) return false;
  if (element.closest('nav[aria-label]')) return false;
  if (element.closest('[role="menu"], [role="menuitem"]')) return false;

  const normalized = normalizeActionLabel(label);
  if (!normalized || SKIP_ACTION_LABELS.has(normalized)) return false;

  if (element.hasAttribute("data-action-toast")) return true;

  const variant = inferButtonVariant(element);
  if (variant === "ghost") return false;

  if (
    element instanceof HTMLInputElement &&
    (element.type === "submit" || element.type === "button")
  ) {
    return isActionLikeLabel(normalized);
  }

  if (element.getAttribute("type") === "submit") return true;

  if (
    variant === "primary" ||
    variant === "success" ||
    variant === "accent" ||
    variant === "danger"
  ) {
    return true;
  }

  return isActionLikeLabel(normalized);
}
