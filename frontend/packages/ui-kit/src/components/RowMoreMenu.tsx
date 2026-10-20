"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { useIsHydrated } from "../hooks/use-is-hydrated";
import { Spinner } from "./Spinner";

export type RowMoreMenuItem = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** In-item spinner — tap is in progress (e.g. navigating). */
  busy?: boolean;
  danger?: boolean;
  /** Outline icon shown before the label (RTL: ends up on the right). */
  icon?: ReactNode;
  /** Draw a thin separator line above this item. */
  separatorBefore?: boolean;
};

function MenuStrokeIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** Icons matching Case Study.html `taskKebab` strokes. */
export const RowMoreMenuIcons = {
  eye: (
    <MenuStrokeIcon>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </MenuStrokeIcon>
  ),
  play: (
    <MenuStrokeIcon>
      <polygon points="5 3 19 12 5 21 5 3" />
    </MenuStrokeIcon>
  ),
  pause: (
    <MenuStrokeIcon>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </MenuStrokeIcon>
  ),
  checkCircle: (
    <MenuStrokeIcon>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </MenuStrokeIcon>
  ),
  bell: (
    <MenuStrokeIcon>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </MenuStrokeIcon>
  ),
  flag: (
    <MenuStrokeIcon>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </MenuStrokeIcon>
  ),
  arrowRight: (
    <MenuStrokeIcon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </MenuStrokeIcon>
  ),
  building: (
    <MenuStrokeIcon>
      <path d="M3 21h18M6 21V10M18 21V10M4 10h16L12 3z" />
    </MenuStrokeIcon>
  ),
  cancel: (
    <MenuStrokeIcon>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </MenuStrokeIcon>
  ),
};

function KebabIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;
const MENU_MIN_WIDTH_PX = 196;
const MENU_MAX_WIDTH_PX = 320;

function computeMenuStyle(
  btn: HTMLElement,
  menu: HTMLElement,
): CSSProperties {
  const rect = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxWidth = Math.min(MENU_MAX_WIDTH_PX, vw - VIEWPORT_MARGIN * 2);
  const menuWidth = Math.min(
    Math.max(menu.offsetWidth, MENU_MIN_WIDTH_PX),
    maxWidth,
  );
  const menuHeight = menu.offsetHeight;

  let left = rect.right - menuWidth;
  if (left < VIEWPORT_MARGIN) {
    left = rect.left;
  }
  if (left + menuWidth > vw - VIEWPORT_MARGIN) {
    left = vw - menuWidth - VIEWPORT_MARGIN;
  }
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, vw - menuWidth - VIEWPORT_MARGIN),
  );

  let top = rect.bottom + MENU_GAP;
  if (menuHeight > 0 && top + menuHeight > vh - VIEWPORT_MARGIN) {
    const above = rect.top - menuHeight - MENU_GAP;
    if (above >= VIEWPORT_MARGIN) top = above;
  }

  return {
    position: "fixed",
    top,
    left,
    zIndex: 1200,
    minWidth: `${MENU_MIN_WIDTH_PX}px`,
    maxWidth: `${maxWidth}px`,
    width: "max-content",
  };
}

const moreBtnClass = (open: boolean) =>
  cn(
    "inline-grid h-8 w-8 place-items-center rounded-lg border border-transparent bg-transparent text-text-2 outline-none transition-[background,color,border-color] duration-150 hover:border-border-md hover:bg-surface-2 hover:text-heading",
    open && "border-border-md bg-surface-2 text-heading",
  );

export function RowMoreMenu({
  items,
  ariaLabel = "المزيد",
  buttonClassName,
  busy = false,
}: {
  items: RowMoreMenuItem[];
  ariaLabel?: string;
  buttonClassName?: string;
  /** Replace the kebab with a spinner while a menu action is in flight. */
  busy?: boolean;
}) {
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const mounted = useIsHydrated();
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;

    let raf = 0;
    let enterRaf = 0;

    function placeMenu() {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      setMenuStyle(computeMenuStyle(btn, menu));
    }

    placeMenu();
    raf = requestAnimationFrame(placeMenu);
    enterRaf = requestAnimationFrame(() => setEntered(true));

    window.addEventListener("resize", placeMenu);
    // passive: listener does not block scroll — lets the browser skip waiting (client-passive-event-listeners).
    window.addEventListener("scroll", placeMenu, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(enterRaf);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, { capture: true });
    };
  }, [open, items.length]);

  // Reset placement while closing, during render rather than in an effect, so a
  // reopen always replays the enter transition without an extra commit.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setMenuStyle({});
      setEntered(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menu = open ? (
    <div
      ref={menuRef}
      id={menuId}
      className={cn(
        "w-max max-w-[min(20rem,calc(100vw-1rem))] rounded-[11px] border border-border-md bg-surface p-1.5 shadow-[0_12px_30px_-8px_rgba(18,40,76,0.3)] transition-[opacity,transform] duration-150 ease-out",
        entered
          ? "translate-y-0 opacity-100"
          : "-translate-y-1 opacity-0",
      )}
      role="menu"
      data-no-action-toast
      style={menuStyle}
    >
      {items.map((item, index) => {
        const showSep =
          item.separatorBefore ||
          (item.danger &&
            !items.slice(0, index).some((prev) => prev.danger) &&
            index > 0);
        return (
          <div key={item.id}>
            {showSep ? (
              <div
                className="mx-1 my-1 h-px bg-border"
                role="separator"
              />
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full min-w-0 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg border-none bg-transparent px-2.5 py-[9px] text-start text-[13px] font-semibold text-text transition-[background,color] duration-[130ms] hover:bg-row-hover disabled:pointer-events-none disabled:opacity-40",
                item.danger &&
                  "text-[#d9694f] hover:bg-[color-mix(in_srgb,#d9694f_10%,transparent)]",
              )}
              disabled={item.disabled || item.busy || busy}
              aria-busy={item.busy || undefined}
              onClick={() => {
                if (item.disabled || item.busy || busy) return;
                setOpen(false);
                item.onClick();
              }}
            >
              {item.busy ? (
                <Spinner className="size-3.5" />
              ) : (
                (item.icon ?? null)
              )}
              <span className="min-w-0">{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex justify-center align-middle"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        className={cn(moreBtnClass(open), buttonClassName)}
        aria-label={busy ? "جاري التحميل…" : ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={() => {
          if (busy) return;
          setOpen((v) => !v);
        }}
      >
        {busy ? <Spinner className="size-3.5" /> : <KebabIcon />}
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
