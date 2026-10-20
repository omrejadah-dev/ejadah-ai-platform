"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * How tightly `FormRow` lays fields out. `comfortable` is the two-column default;
 * `compact` adds up to six columns on wide screens — for long edit forms
 * (e.g. «تعديل العقار») where two 780px-wide fields per line feel oversized.
 */
export type FormDensity = "comfortable" | "compact";

const FormDensityContext = createContext<FormDensity>("comfortable");

export const FormDensityProvider = FormDensityContext.Provider;

export function useFormDensity(): FormDensity {
  return useContext(FormDensityContext);
}

/** True inside a compact `FormFlowGrid`: `InfathSection`/`FormRow` dissolve into the grid. */
const FormFlowContext = createContext(false);

export function useFormFlow(): boolean {
  return useContext(FormFlowContext);
}

/** Column ladder shared by compact form grids: 2 → 3 → 4 → 6 as the screen widens. */
export const COMPACT_FORM_GRID_CLASS =
  "grid grid-cols-1 gap-x-3 gap-y-2.5 min-[561px]:grid-cols-2 min-[1024px]:grid-cols-3 min-[1280px]:grid-cols-4 min-[1536px]:grid-cols-6";

/**
 * Stacks its sections as a column by default. Inside `FormDensityProvider value="compact"`
 * it becomes one grid and every section's fields flow together, so each row fills up to
 * six fields instead of ending after one section's few fields. Section titles turn
 * screen-reader-only (a visible title would break the row); other non-field content must
 * span the row (`col-span-full`).
 */
export function FormFlowGrid({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  if (useFormDensity() !== "compact") {
    return <div className={cn("flex flex-col gap-5", className)}>{children}</div>;
  }
  return (
    <FormFlowContext.Provider value>
      <div className={cn(COMPACT_FORM_GRID_CLASS, className)}>{children}</div>
    </FormFlowContext.Provider>
  );
}
