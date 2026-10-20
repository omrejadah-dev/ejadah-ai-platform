"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { cn } from "../lib/cn";
import {
  ModalBody,
  ModalCard,
  ModalClose,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalTitle,
} from "./Modal";
import { opsModalClose, opsModalFooter } from "../lib/ops-chrome";

export type AppModalProps = {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  /** Optional leading icon in the header (e.g. reopen lock). */
  headerIcon?: ReactNode;
  children: ReactNode;
  /** Action row — usually `Button`s; right-aligned, stacks full-width on narrow viewports. */
  footer?: ReactNode;
  onClose: () => void;
  /** Wider card (720px) for two-column forms (PO intake, etc.). @default false */
  wide?: boolean;
  /** Explicit max width in px (e.g. 720 for HTML task create). Overrides `wide`'s default. */
  maxWidthPx?: number;
  /** Ops create-task look: start-aligned title, gray ×, surface-2 footer. */
  look?: "ops-html";
  /** Sit above another already-open modal (`--z-modal-2`). @default false */
  stacked?: boolean;
};

/**
 * Composed confirmation/form dialog — `ModalOverlay` + `ModalCard` +
 * `ModalHeader`/`ModalTitle`/`ModalClose` + `ModalBody` + optional
 * `ModalFooter`. Escape closes; Tab is trapped inside the dialog; focus
 * returns to whatever triggered the open on close; background scroll is
 * locked; `aria-labelledby` points at `ModalTitle`. Prefer this over
 * assembling the `Modal.*` pieces by hand.
 */
export function AppModal({
  open,
  title,
  subtitle,
  headerIcon,
  children,
  footer,
  onClose,
  wide,
  maxWidthPx,
  look,
  stacked,
}: AppModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const maxPx = maxWidthPx ?? (wide ? 720 : 420);
  const opsHtml = look === "ops-html";
  const overlayZ = stacked ? "!z-[var(--z-modal-2)]" : undefined;

  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  // Remember the trigger and give it focus back once the dialog closes.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      openerRef.current?.focus?.();
      openerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const insideRoot = !!active && root.contains(active);
      if (e.shiftKey) {
        if (!insideRoot || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!insideRoot || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  /*
    Wrapper must own width: overlay is flex; without w-full the card
    shrink-wraps to content and ignores ModalCard max-width.
  */
  const panel = (
    <div
      ref={panelRef}
      tabIndex={-1}
      className={
        opsHtml
          ? "w-full outline-none [animation:opsModalIn_0.22s_ease_both]"
          : "w-full outline-none"
      }
      style={{ maxWidth: maxPx }}
      onClick={(e) => e.stopPropagation()}
    >
      <ModalCard
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-w-none"
      >
        <ModalHeader
          className={
            subtitle || opsHtml || headerIcon
              ? "items-start px-[22px] py-4"
              : undefined
          }
        >
          <div className="flex min-w-0 flex-1 items-start gap-[13px]">
            {headerIcon ? (
              <span className="shrink-0" aria-hidden>
                {headerIcon}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <ModalTitle
                id={titleId}
                className="text-start text-[16px] font-extrabold"
              >
                {title}
              </ModalTitle>
              {subtitle ? (
                <div
                  className={
                    headerIcon
                      ? "m-0 mt-[5px] text-[12.5px] font-normal leading-[1.7] text-text-2"
                      : "m-0 mt-1 text-[12px] font-normal text-text-3"
                  }
                >
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
          {opsHtml ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className={opsModalClose}
            >
              ×
            </button>
          ) : (
            <ModalClose onClick={onClose} aria-label="إغلاق">
              ×
            </ModalClose>
          )}
        </ModalHeader>
        <ModalBody
          className={
            wide || maxWidthPx || opsHtml ? "px-[22px] py-5" : undefined
          }
        >
          {children}
        </ModalBody>
        {footer ? (
          opsHtml ? (
            <footer className={opsModalFooter}>{footer}</footer>
          ) : (
            <ModalFooter>{footer}</ModalFooter>
          )
        ) : null}
      </ModalCard>
    </div>
  );

  /* ops-html (create task): HTML-matching overlay — blur + top-aligned appear */
  if (opsHtml) {
    return (
      <>
        <style>{`@keyframes opsModalIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}`}</style>
        <div
          onClick={onClose}
          role="presentation"
          className={`fixed inset-0 ${stacked ? "z-[var(--z-modal-2)]" : "z-[var(--z-modal)]"} flex items-start justify-center overflow-y-auto bg-[rgba(16,43,78,0.42)] px-4 py-[6vh] backdrop-blur-[2px]`}
        >
          {panel}
        </div>
      </>
    );
  }

  return (
    <ModalOverlay
      onClick={onClose}
      role="presentation"
      className={cn("overflow-hidden", overlayZ)}
    >
      {panel}
    </ModalOverlay>
  );
}
