// app/SubmitMenuClient.tsx  — NEW file (client component)
"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Client-only menu:
 * - Does not render on server (ssr: false import from layout)
 * - Creates a portal container on document.body
 * - Renders the menu there with position:fixed to avoid being occluded by map
 * - Hooks up click/ESC/outside/resize/scroll handling
 */

export default function SubmitMenuClient() {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  // create portal container once
  useEffect(() => {
    const mount = document.createElement("div");
    mount.id = "submit-menu-portal";
    mount.style.position = "fixed";
    mount.style.top = "0";
    mount.style.left = "0";
    mount.style.width = "100%";
    mount.style.height = "0";
    mount.style.pointerEvents = "none";
    mount.style.zIndex = "999999"; // base; menu itself higher
    document.body.appendChild(mount);
    setPortalEl(mount);
    return () => {
      if (mount.parentElement) mount.parentElement.removeChild(mount);
    };
  }, []);

  // toggle by binding to existing server-rendered button
  useEffect(() => {
    const btn = document.getElementById("submitMenuBtn");
    if (!btn) return;
    function onClick(ev: MouseEvent) {
      ev.stopPropagation();
      setOpen((v) => !v);
    }
    btn.addEventListener("click", onClick);
    return () => btn.removeEventListener("click", onClick);
  }, []);

  // compute position whenever opened (and on resize/scroll)
  useEffect(() => {
    function compute() {
      const btn = document.getElementById("submitMenuBtn");
      const menu = menuRef.current;
      if (!btn || !menu) return;
      const rect = btn.getBoundingClientRect();
      // ensure menu is visible to measure
      menu.style.visibility = "hidden";
      menu.style.display = "block";
      const mw = menu.offsetWidth;
      // restore
      menu.style.visibility = "";
      // top: below button
      const top = Math.round(rect.bottom + 8);
      // left: center align below button, clamp to viewport
      let left = Math.round(rect.left + rect.width / 2 - mw / 2);
      const margin = 8;
      const minLeft = margin;
      const maxLeft = Math.max(margin, window.innerWidth - mw - margin);
      if (left < minLeft) left = minLeft;
      if (left > maxLeft) left = maxLeft;
      menu.style.left = left + "px";
      menu.style.top = top + "px";
    }

    if (open) compute();
    const deb = () => {
      if (open) compute();
    };
    window.addEventListener("resize", deb);
    window.addEventListener("scroll", deb, true);
    return () => {
      window.removeEventListener("resize", deb);
      window.removeEventListener("scroll", deb, true);
    };
  }, [open]);

  // outside click and ESC
  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (!open) return;
      const btn = document.getElementById("submitMenuBtn");
      const menu = menuRef.current;
      const t = ev.target as Node;
      if (btn && (btn === t || btn.contains(t))) return;
      if (menu && menu.contains(t)) return;
      setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // prevent body scroll when menu open? (optional)
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (open) document.body.style.overflow = prev; // keep normal (we do NOT lock)
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // menu element to portal
  const menuNode = (
    <div
      ref={menuRef}
      id="submit-menu-client"
      role="menu"
      aria-label="Submit and report menu"
      style={{
        position: "fixed",
        zIndex: 9999999,
        pointerEvents: open ? "auto" : "none",
        opacity: open ? 1 : 0,
        transition: "opacity 150ms ease, transform 150ms ease",
        transform: open ? "translateY(0)" : "translateY(-6px)",
        left: "0px",
        top: "0px",
        // small visual defaults (Tailwind-like)
        width: 256,
      }}
      className="bg-white border rounded shadow-lg ring-1 ring-black/5 py-2"
    >
      <div className="px-3 py-2">
        <a href="/submit.html" className="block text-sm font-medium py-2 hover:bg-neutral-50" role="menuitem">
          Submission Hub
        </a>
        <div className="border-t my-1" />
        <a href="/forms/owner.html" className="block text-sm py-2 hover:bg-neutral-50" role="menuitem">
          Owner Submission (direct)
        </a>
        <a href="/forms/community.html" className="block text-sm py-2 hover:bg-neutral-50" role="menuitem">
          Community Evidence (direct)
        </a>
        <a href="/forms/report.html" className="block text-sm py-2 hover:bg-neutral-50" role="menuitem">
          Report an Issue (direct)
        </a>
      </div>
    </div>
  );

  if (!portalEl) return null;
  return createPortal(menuNode, portalEl);
}
