"use client";

import { useState } from "react";
import { cn } from "../lib/cn";
import { Button } from "./Button";

/**
 * The pager numbers a screen derives from a `PagedResultDto` envelope
 * (`docs/architecture/pagination-contract.md`): `totalCount` / `totalPages`
 * are the server's, the page is clamped into range, and the range label is
 * 1-based and inclusive. Pure, so a screen can reuse it for a client-side
 * window over a whole list.
 */
export function listPagerWindow(input: {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages?: number;
}) {
  const pageSize = input.pageSize > 0 ? input.pageSize : 1;
  const totalPages = Math.max(
    1,
    input.totalPages ?? Math.ceil(input.totalCount / pageSize),
  );
  const safePage = Math.min(Math.max(1, Math.trunc(input.page) || 1), totalPages);
  return {
    totalPages,
    safePage,
    rangeStart: input.totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1,
    rangeEnd: Math.min(safePage * pageSize, input.totalCount),
  };
}

export type ListPagerProps = {
  page: number;
  totalCount: number;
  /** From the envelope when the server paged; derived from the count otherwise. */
  totalPages?: number;
  /**
   * Rows per page. Either pass it, or pass a precomputed `rangeStart` /
   * `rangeEnd` (the `listPagerWindow` output) — a screen that already cut its
   * window spreads that object straight in.
   */
  pageSize?: number;
  rangeStart?: number;
  rangeEnd?: number;
  onPageChange: (page: number) => void;
  /** Shows «—» for the range while the first page is still loading. */
  pending?: boolean;
  /** The inverse signal: `ready={false}` is the same as `pending`. */
  ready?: boolean;
  /** The counted noun after the total (e.g. "معاملة", "طرف"). @default "نتيجة" */
  unit?: string;
  className?: string;
};

/**
 * The shared list pager: total + range («2,480 معاملة · 1–25»), a
 * type-to-jump «صفحة [ N ] من M» field, and previous/next — no numbered
 * page-number strip (docs/new-look decision, option B). The markup the PO
 * list renders and the finance journeys assert against.
 */
export function ListPager({
  page,
  pageSize,
  totalCount,
  totalPages,
  rangeStart,
  rangeEnd,
  onPageChange,
  pending = false,
  ready,
  unit = "نتيجة",
  className,
}: ListPagerProps) {
  // Without an explicit page size, recover it from the envelope so the
  // numbered pages still line up with the server's `totalPages`.
  const effectivePageSize =
    pageSize ??
    (totalPages && totalPages > 0
      ? Math.max(1, Math.ceil(totalCount / totalPages))
      : Math.max(1, totalCount));
  const win = listPagerWindow({
    page,
    pageSize: effectivePageSize,
    totalCount,
    totalPages,
  });
  const start = rangeStart ?? win.rangeStart;
  const end = rangeEnd ?? win.rangeEnd;
  const waiting = pending || ready === false;

  // The box mirrors the active page; syncing during render keeps it from showing
  // the previous number for one paint after the page changes elsewhere.
  const [pageDraft, setPageDraft] = useState(String(win.safePage));
  const [draftForPage, setDraftForPage] = useState(win.safePage);
  if (draftForPage !== win.safePage) {
    setDraftForPage(win.safePage);
    setPageDraft(String(win.safePage));
  }

  function commitPageDraft() {
    const n = Math.trunc(Number(pageDraft));
    if (Number.isFinite(n) && n >= 1 && n <= win.totalPages && n !== win.safePage) {
      onPageChange(n);
    } else {
      setPageDraft(String(win.safePage));
    }
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 py-3",
        className,
      )}
    >
      <span className="text-[13px] text-text-3">
        {waiting ? (
          "—"
        ) : (
          <>
            <b className="font-medium text-heading tabular-nums">
              {totalCount.toLocaleString("en-US")}
            </b>{" "}
            {unit} · <span className="tabular-nums">{start}–{end}</span>
          </>
        )}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] text-text-3">صفحة</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label="رقم الصفحة"
          className="h-[30px] w-11 rounded-[9px] border border-border-md bg-surface text-center text-[13px] text-text tabular-nums outline-none transition-[border-color,box-shadow] focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-55"
          value={pageDraft}
          disabled={waiting}
          onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={commitPageDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitPageDraft();
            }
          }}
        />
        <span className="text-[13px] text-text-3 tabular-nums">
          من {win.totalPages.toLocaleString("en-US")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-[30px] w-[30px] p-0 disabled:opacity-40"
          disabled={win.safePage <= 1}
          onClick={() => onPageChange(win.safePage - 1)}
          aria-label="الصفحة السابقة"
          showActionToast={false}
        >
          ‹
        </Button>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-[30px] w-[30px] p-0 disabled:opacity-40"
          disabled={win.safePage >= win.totalPages}
          onClick={() => onPageChange(win.safePage + 1)}
          aria-label="الصفحة التالية"
          showActionToast={false}
        >
          ›
        </Button>
      </div>
    </div>
  );
}
