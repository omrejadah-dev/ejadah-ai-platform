import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type ModalOverlayProps = HTMLAttributes<HTMLDivElement>;

/** Full-viewport navy scrim + centering flex — the fixed-position backdrop behind `ModalCard`. Most call sites want `AppModal` instead, which composes this whole family. */
export function ModalOverlay({
  className,
  ...props
}: ModalOverlayProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[rgba(10,33,56,0.45)] p-4 sm:p-5 ui-animate-modal-overlay",
        "max-lg:items-end max-lg:justify-center max-lg:p-0",
        className,
      )}
      {...props}
    />
  );
}

export type ModalCardProps = HTMLAttributes<HTMLDivElement> & {
  /** 720px max-width instead of 420px — two-column forms. @default false */
  wide?: boolean;
};

/** The dialog panel itself — compose with `ModalHeader`/`ModalBody`/`ModalFooter` inside a `ModalOverlay`. */
export function ModalCard({
  className,
  wide,
  ...props
}: ModalCardProps) {
  return (
    <div
      className={cn(
        "flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-modal",
        wide ? "max-w-[720px]" : "max-w-[420px]",
        "max-lg:max-h-[min(92dvh,100%)] max-lg:max-w-none max-lg:rounded-b-none max-lg:rounded-t-[16px] max-lg:border-x-0 max-lg:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

export type ModalHeaderProps = HTMLAttributes<HTMLElement>;

/** Dialog header row — pair with `ModalTitle` and (usually) `ModalClose`. */
export function ModalHeader({
  className,
  ...props
}: ModalHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3.5",
        className,
      )}
      {...props}
    />
  );
}

export type ModalTitleProps = HTMLAttributes<HTMLHeadingElement>;

/** Dialog `<h2>` — give it an `id` and point `AppModal`'s (or your own) `aria-labelledby` at it. */
export function ModalTitle({
  className,
  ...props
}: ModalTitleProps) {
  return (
    <h2
      className={cn(
        "m-0 flex-1 text-center text-[15px] font-semibold text-text",
        className,
      )}
      {...props}
    />
  );
}

export type ModalCloseProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** The `×` icon button in the header — wire `onClick` to your close handler; give it `aria-label="إغلاق"`. */
export function ModalClose({
  className,
  type = "button",
  ...props
}: ModalCloseProps) {
  return (
    <button
      type={type}
      className={cn(
        "grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[9px] border-none bg-surface-2 p-0 font-[inherit] text-[15px] leading-none text-text-2 transition-[background,color] hover:bg-row-hover hover:text-heading",
        className,
      )}
      {...props}
    />
  );
}

export type ModalBodyProps = HTMLAttributes<HTMLDivElement>;

/** Scrollable dialog content area between the header and footer. */
export function ModalBody({
  className,
  ...props
}: ModalBodyProps) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto p-4", className)}
      {...props}
    />
  );
}

export type ModalFooterProps = HTMLAttributes<HTMLElement>;

/** Dialog action row — right-aligned `Button`s; on narrow viewports they stack full-width automatically. */
export function ModalFooter({
  className,
  children,
  ...props
}: ModalFooterProps) {
  return (
    <footer
      className={cn(
        "flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-border bg-surface-2 px-4 py-3.5 sm:px-[22px]",
        "max-lg:sticky max-lg:bottom-0 max-lg:pb-[max(0.875rem,env(safe-area-inset-bottom))] max-lg:[&>button]:min-h-11 max-lg:[&>button]:flex-1 max-lg:[&>button]:justify-center",
        className,
      )}
      {...props}
    >
      {children}
    </footer>
  );
}
