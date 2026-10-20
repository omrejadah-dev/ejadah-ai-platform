import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import {
  operationalToolbarPrimaryButtonClassName,
  operationalToolbarSearchIconClassName,
  operationalToolbarSearchInputClassName,
  operationalToolbarSearchWrapClassName,
  operationalToolbarSelectCaretClassName,
  operationalToolbarSelectClassName,
  operationalToolbarSelectWrapClassName,
} from "../lib/operational-toolbar-classes";

function SearchGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CaretGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export type OperationalToolbarSearchProps = InputHTMLAttributes<HTMLInputElement> & {
  inputClassName?: string;
  /** Extra control rendered before the input (after the search glyph). */
  startAdornment?: ReactNode;
  /** Extra control rendered after the input (e.g. a clear button). */
  endAdornment?: ReactNode;
};

/** Search input for a `PageToolbar`/`FilterBar` row — leading magnifier glyph, optional adornments. */
export function OperationalToolbarSearch({
  className,
  inputClassName,
  startAdornment,
  endAdornment,
  ...props
}: OperationalToolbarSearchProps) {
  return (
    <div className={cn(operationalToolbarSearchWrapClassName, className)}>
      <span className={operationalToolbarSearchIconClassName}>
        <SearchGlyph />
      </span>
      {startAdornment}
      <input
        className={cn(
          operationalToolbarSearchInputClassName,
          // Room for the adornment; the native search «×» would land mid-field beside it.
          endAdornment
            ? "pe-[8.5rem] [&::-webkit-search-cancel-button]:appearance-none"
            : null,
          inputClassName,
        )}
        {...props}
      />
      {endAdornment}
    </div>
  );
}

export type OperationalToolbarSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  selectClassName?: string;
};

/** Native `<select>` for a toolbar row, with the shared caret glyph and border styling. */
export function OperationalToolbarSelect({
  className,
  selectClassName,
  children,
  ...props
}: OperationalToolbarSelectProps) {
  return (
    <div className={cn(operationalToolbarSelectWrapClassName, className)}>
      <select
        className={cn(operationalToolbarSelectClassName, selectClassName)}
        {...props}
      >
        {children}
      </select>
      <span className={operationalToolbarSelectCaretClassName}>
        <CaretGlyph />
      </span>
    </div>
  );
}

export type OperationalToolbarPrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Leading glyph, 16px, stroke 2 / `currentColor` (e.g. plus for create, up-arrow for upload). */
  icon?: ReactNode;
};

/** The toolbar's one primary action (e.g. "طلب جديد") — navy fill, lifts 1px on hover. */
export function OperationalToolbarPrimaryButton({
  className,
  children,
  icon,
  ...props
}: OperationalToolbarPrimaryButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        operationalToolbarPrimaryButtonClassName,
        icon ? "[&>svg]:h-4 [&>svg]:w-4" : null,
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
