"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { findNavItem, isActiveRoute, type NavGroup } from "@/lib/nav";

/** Top-bar trail: "Missions / Practice ▾ / Blurting". The group crumb opens a
 *  menu of the pages beside this one -- click rather than hover, so it works
 *  on touch. */
export function SectionBreadcrumb({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const match = findNavItem(pathname, groups);
  const section = match?.group.section ?? "Workspace";
  const group = match?.group.label ? match.group : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const slash = <span className="text-content-subtle/60">/</span>;

  return (
    <nav aria-label="Breadcrumb" ref={containerRef} className="flex min-w-0 items-center gap-2 text-sm">
      <span className="text-content-subtle">{section}</span>
      {group && (
        <>
          {slash}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 text-content-subtle transition-colors hover:bg-surface-sunken hover:text-content"
            >
              {group.label}
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div
                role="menu"
                aria-label={group.label ?? undefined}
                className="absolute left-0 top-full z-50 mt-1.5 min-w-44 rounded-lg border border-subtle bg-surface-raised p-1.5 shadow-overlay"
              >
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  const current = isActiveRoute(item, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      aria-current={current ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                        current ? "bg-accent text-accent-fg" : "text-content-muted hover:bg-surface-sunken hover:text-content"
                      }`}
                    >
                      <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      {match && (
        <>
          {slash}
          <span className="truncate font-medium text-content">{match.item.label}</span>
        </>
      )}
    </nav>
  );
}
