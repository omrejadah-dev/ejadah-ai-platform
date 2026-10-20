"use client";

import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";
import {
  COMPACT_FORM_GRID_CLASS,
  useFormDensity,
  useFormFlow,
} from "../lib/form-density";

export type FormRowProps = HTMLAttributes<HTMLDivElement>;

/**
 * Form row — two columns (stacks to one under 561px); three from 1024px, four from
 * 1280px and six from 1536px inside a `FormDensityProvider value="compact"`. Pair fields that belong on the
 * same line (e.g. a date range).
 */
export function FormRow({
  className,
  ...props
}: FormRowProps) {
  const compact = useFormDensity() === "compact";
  // Inside a FormFlowGrid the fields belong to the surrounding grid, not to this row.
  const flows = useFormFlow();
  return (
    <div
      className={cn(
        flows
          ? "contents"
          : compact
            ? COMPACT_FORM_GRID_CLASS
            : "grid grid-cols-1 gap-3.5 min-[561px]:grid-cols-2",
        className,
      )}
      {...props}
    />
  );
}
