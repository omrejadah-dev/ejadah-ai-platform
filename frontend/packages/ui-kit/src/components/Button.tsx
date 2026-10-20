import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";
import { Spinner } from "./Spinner";

const variantClasses = {
  default:
    "border border-border-md bg-surface text-text-2 enabled:hover:bg-row-hover",
  primary:
    "border-none bg-ink text-white enabled:hover:bg-navy-3",
  outline:
    "border border-primary bg-transparent text-primary enabled:hover:bg-gold-soft",
  /** @deprecated Gold fill — accent is decorative only, never a button fill. Use `primary` (main action) or `outline` (secondary). Kept for one release before removal. */
  accent:
    "border-none bg-gold-d text-white shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--gold-d)_60%,transparent)] enabled:hover:bg-gold",
  danger:
    "border border-red/30 bg-danger-bg text-danger-text enabled:hover:bg-[color-mix(in_srgb,var(--danger)_22%,var(--surface))]",
  success:
    "border-none bg-ink text-white enabled:hover:bg-navy-3",
  dangerOutline:
    "border border-red/30 bg-transparent text-danger-text enabled:hover:bg-danger-bg",
  ghost:
    "border border-transparent bg-transparent text-text-2 enabled:hover:bg-row-hover",
} as const;

const sizeClasses = {
  default: "h-[38px] gap-2 px-[18px] text-sm",
  sm: "h-8 gap-1.5 px-3.5 text-xs",
  lg: "h-11 gap-2 px-[18px] text-sm",
} as const;

const iconSizeClasses = {
  default: "[&>svg]:h-4 [&>svg]:w-4",
  sm: "[&>svg]:h-3.5 [&>svg]:w-3.5",
  lg: "[&>svg]:h-4 [&>svg]:w-4",
} as const;

export type ButtonVariant = keyof typeof variantClasses;
export type ButtonSize = keyof typeof sizeClasses;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /**
   * Leading glyph, 16px (14px in `size="sm"`), stroke 2 / `currentColor`.
   * Reserve this for the one main action in a view (check for save/approve,
   * plus for create, up-arrow for upload) — secondary buttons stay plain.
   */
  icon?: ReactNode;
  /** Explicit label for the global progress toast. */
  actionLabel?: string;
  /** Set on the element to skip the global progress toast. */
  showActionToast?: boolean;
};

/**
 * The one button component for every control surface — 38px default height
 * (`size="sm"` 32px, `size="lg"` 44px; `Input`/`Select` match at 38px so
 * fields and buttons align). `primary` (navy) is the single main action per
 * view; `default`/`outline` are secondary with a grey hairline (never navy);
 * `ghost` is quiet; `danger`/`dangerOutline` are destructive. `accent`
 * (gold fill) is deprecated — gold is a decorative mark, not a button fill.
 */
export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  loading = false,
  disabled,
  children,
  icon,
  actionLabel,
  showActionToast = true,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-button-variant={variant}
      data-action-label={actionLabel}
      data-no-action-toast={showActionToast ? undefined : true}
      className={cn(
        "inline-flex items-center justify-center rounded-[9px] font-[inherit] font-medium whitespace-nowrap outline-none transition-colors duration-[130ms] cursor-pointer enabled:active:brightness-95 disabled:cursor-not-allowed disabled:opacity-55",
        variantClasses[variant],
        sizeClasses[size],
        icon ? iconSizeClasses[size] : null,
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
