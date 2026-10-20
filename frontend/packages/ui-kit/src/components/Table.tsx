import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { GentleLoadingCopy } from "./GentleBusy";
import {
  cx,
  tableClassName,
  tableFrameClassName,
  tableWrapClassName,
  tdActionClassName,
  tdClassName,
  tdLinkClassName,
  tdLtrValueClassName,
  thActionClassName,
  thClassName,
  trHeightClassName,
  trHoverClassName,
  trSelectedClassName,
  trStripeClassName,
} from "../lib/table-classes";

export {
  cx as tableCx,
  tableClassName,
  tableFrameClassName,
  tableWrapClassName,
  tdActionClassName,
  tdClassName,
  tdLinkClassName,
  tdLtrValueClassName,
  thActionClassName,
  thClassName,
  trHoverClassName,
} from "../lib/table-classes";

export type TableFrameProps = HTMLAttributes<HTMLDivElement>;

/** Bordered card chrome around a `Table` — pass `framed` on `Table` instead of nesting manually. */
export function TableFrame({
  className,
  ...props
}: TableFrameProps) {
  return <div className={cx(tableFrameClassName, className)} {...props} />;
}

export type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  /** Dims the body while a refetch is in flight — keeps the last rows visible. */
  pending?: boolean;
  /** Classes for the outer scroll/clip wrapper around the `<table>`. */
  wrapClassName?: string;
  /** Wrap in the shared letter-card chrome (rounded border). @default false */
  framed?: boolean;
  /** `"dense"` rows are 32px with odd-row striping instead of the default 36px. @default "default" */
  density?: "default" | "dense";
};

/**
 * Data table shell — compose with `THead`/`TBody`/`Tr`/`Th`/`Td`. The header
 * row gets the brand gold underline automatically via `tokens/colors.css`.
 * Wrap the `<table>` in a scrolling `TableFrame` for the sticky `Th` row to
 * take effect (pass `framed`, or nest your own).
 */
export function Table({
  className,
  pending,
  wrapClassName,
  framed = false,
  density = "default",
  ...props
}: TableProps) {
  const scroll = (
    <div className={cx(tableWrapClassName, wrapClassName)}>
      <table
        data-pending={pending ? "true" : undefined}
        data-density={density === "dense" ? "dense" : undefined}
        className={cx(
          tableClassName,
          "group",
          pending &&
            "[&_tbody]:opacity-55 [&_tbody]:transition-opacity [&_tbody]:duration-200",
          className,
        )}
        {...props}
      />
    </div>
  );
  if (!framed) return scroll;
  return <TableFrame>{scroll}</TableFrame>;
}

export type THeadProps = HTMLAttributes<HTMLTableSectionElement>;

/** Plain `<thead>` — the header row's gold underline comes from `Th`/`Tr`, not this wrapper. */
export function THead(props: THeadProps) {
  return <thead {...props} />;
}

export type TBodyProps = HTMLAttributes<HTMLTableSectionElement>;

/** Plain `<tbody>` — wrap `Tr` rows here (or a single `TableEmptyRow` when there's nothing to show). */
export function TBody(props: TBodyProps) {
  return <tbody {...props} />;
}

export type TrProps = HTMLAttributes<HTMLTableRowElement> & {
  /** Row-hover background on non-header rows. @default true */
  hoverable?: boolean;
};

/**
 * Table row — 36px (32px + odd-row striping under `Table density="dense"`).
 * Set `hoverable={false}` for header rows or rows that shouldn't highlight
 * on hover. Set the `data-selected` attribute (any value) for a selected
 * row — it fills gold-soft.
 */
export function Tr({
  className,
  hoverable = true,
  ...props
}: TrProps) {
  return (
    <tr
      className={cx(
        trHeightClassName,
        trStripeClassName,
        trSelectedClassName,
        hoverable && trHoverClassName,
        "[&:last-child_td]:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

export type ThProps = ThHTMLAttributes<HTMLTableCellElement> & {
  /** Sortable column — shows a gold sort arrow and sets `aria-sort`. Omit (or `false`) for a non-sortable column. */
  sort?: "ascending" | "descending" | false;
};

/** Header cell — `text-2` weight-500 label on `surface-2`, sticky under `TableFrame`. Add `scope="col"`. */
export function Th({
  className,
  sort = false,
  children,
  ...props
}: ThProps) {
  return (
    <th aria-sort={sort || undefined} className={cx(thClassName, className)} {...props}>
      {sort ? (
        <span className="inline-flex items-center gap-1">
          {children}
          <svg
            aria-hidden
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cx("shrink-0 text-gold", sort === "descending" && "rotate-180")}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      ) : (
        children
      )}
    </th>
  );
}

export type TdProps = TdHTMLAttributes<HTMLTableCellElement> & {
  /**
   * The row's one identifying column — `font-medium`, `--heading` color.
   * Use on exactly one column per table (named `keyColumn`, not `key`,
   * since `key` is a reserved React prop).
   */
  keyColumn?: boolean;
  /** Numeric column — end-aligned with `tabular-nums`. */
  num?: boolean;
};

/** Body cell. Use `TdLtr` instead for numbers/codes that must stay left-to-right inside an RTL row. */
export function Td({
  className,
  keyColumn,
  num,
  ...props
}: TdProps) {
  return (
    <td
      className={cx(
        tdClassName,
        keyColumn && "font-medium text-heading",
        num && "text-end tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Cell for LTR codes (PO, dates, SAR). Keeps RTL column alignment; isolates bidi.
 * Children are wrapped unless `bare` — then only the td gets defaults.
 */
export type TdLtrProps = TdHTMLAttributes<HTMLTableCellElement> & {
  /** Classes for the inner LTR-isolated `<span>` (ignored when `bare`). */
  valueClassName?: string;
  /** Skip the inner span and apply the `<td>`'s own LTR/isolation defaults directly to `children`. @default false */
  bare?: boolean;
};

export function TdLtr({
  className,
  valueClassName,
  bare = false,
  children,
  ...props
}: TdLtrProps) {
  return (
    <td className={cx(tdClassName, className)} {...props}>
      {bare ? (
        children
      ) : (
        <span dir="ltr" className={cx(tdLtrValueClassName, valueClassName)}>
          {children}
        </span>
      )}
    </td>
  );
}

/** Compact ⋮ / actions column — same horizontal padding as data cells. */
export type ThActionProps = ThHTMLAttributes<HTMLTableCellElement>;

/** Header cell for the trailing actions column (e.g. above a `⋮` menu) — same horizontal padding as `Td`. */
export function ThAction({
  className,
  ...props
}: ThActionProps) {
  return <th className={cx(thActionClassName, className)} {...props} />;
}

export type TdActionProps = TdHTMLAttributes<HTMLTableCellElement>;

/** Compact trailing cell for a single row-actions control (one `⋮` menu — never two actions in one cell). */
export function TdAction({
  className,
  ...props
}: TdActionProps) {
  return <td className={cx(tdActionClassName, className)} {...props} />;
}

export type TableEmptyRowProps = {
  colSpan: number;
  children: ReactNode;
};

/** Convenience empty state row spanning all columns. */
export function TableEmptyRow({
  colSpan,
  children,
}: TableEmptyRowProps) {
  return (
    <Tr hoverable={false}>
      <Td
        colSpan={colSpan}
        className="!py-10 text-center text-[13px] text-text-3"
      >
        <GentleLoadingCopy>{children}</GentleLoadingCopy>
      </Td>
    </Tr>
  );
}
