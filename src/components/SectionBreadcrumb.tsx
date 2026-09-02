"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { GROUP_ICONS, STUDENT_NAV_GROUPS, findNavItem, isActiveRoute } from "@/lib/nav";

const SECTIONS = STUDENT_NAV_GROUPS.filter((group) => group.label !== null);

/** Learn › Review › Practice › Improve. Each pill opens a menu of the pages in
 *  that section — click rather than hover, so it works on touch. */
export function SectionBreadcrumb() {
  const pathname = usePathname();
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeLabel = findNavItem(pathname)?.group.label ?? null;

  useEffect(() => {
    if (!openLabel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpenLabel(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenLabel(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openLabel]);

  return (
    <div
      ref={containerRef}
      className="flex flex-wrap items-center gap-1.5 rounded-card border border-subtle bg-surface px-3 py-2.5 text-sm print:hidden"
    >
      {SECTIONS.map((section, index) => {
        const label = section.label as string;
        const Icon = GROUP_ICONS[label] ?? section.items[0].icon;
        const active = label === activeLabel;
        const open = label === openLabel;

        return (
          <div key={label} className="relative flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOpenLabel(open ? null : label)}
              aria-haspopup="menu"
              aria-expanded={open}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-semibold transition-colors ${
                active
                  ? "bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-sm shadow-indigo-500/20"
                  : "text-content-subtle hover:bg-slate-100 hover:text-content-muted dark:hover:bg-surface/6 dark:hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
              <ChevronRight
                className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""} ${
                  active ? "text-white/80" : "text-content-subtle"
                }`}
              />
            </button>

            {open && (
              <div
                role="menu"
                aria-label={label}
                className="absolute left-0 top-full z-50 mt-1.5 min-w-44 rounded-lg border border-subtle bg-surface p-1.5 shadow-lg dark:bg-[#0D1324]"
              >
                {section.items.map((item) => {
                  const ItemIcon = item.icon;
                  const current = isActiveRoute(item, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      aria-current={current ? "page" : undefined}
                      onClick={() => setOpenLabel(null)}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                        current
                          ? "bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white"
                          : "text-content-muted hover:bg-slate-100 hover:text-content dark:hover:bg-surface/6 dark:hover:text-white"
                      }`}
                    >
                      <ItemIcon
                        className={`h-3.5 w-3.5 shrink-0 ${current ? "text-white" : "text-content-subtle"}`}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}

            {index < SECTIONS.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-content-muted" />
            )}
          </div>
        );
      })}
    </div>
  );
}
