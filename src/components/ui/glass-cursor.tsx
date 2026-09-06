"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlassCursorProps {
  className?: string;
}

const INTERACTIVE_SELECTOR = "a, button, [role='button'], [data-cursor-interactive]";
const NATIVE_CURSOR_SELECTOR = "input, textarea, select, [contenteditable='true'], canvas";

/**
 * A clean-room glass cursor inspired by the supplied reference.
 * It keeps the crisp black arrow and glow without rendering a movement trail.
 */
export function GlassCursor({ className }: GlassCursorProps) {
  const cursorRef = React.useRef<HTMLDivElement>(null);
  const pulseRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const root = document.documentElement;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const position = { x: -80, y: -80 };

    let enabled = false;
    let visible = false;
    let pressed = false;
    let interactive = false;
    let nativeCursorZone = false;

    const updateCursor = () => {
      const scale = pressed ? 0.84 : interactive ? 1.13 : 1;
      cursor.style.transform = `translate3d(${position.x - 4}px, ${position.y - 3}px, 0) scale(${scale})`;
      cursor.style.opacity = visible && !nativeCursorZone && !document.hidden ? "1" : "0";
      cursor.dataset.interactive = interactive ? "true" : "false";
    };

    const setAvailability = () => {
      enabled = finePointer.matches && !reducedMotion.matches;
      root.classList.toggle("glass-cursor-enabled", enabled);
      if (!enabled) {
        visible = false;
        cursor.style.opacity = "0";
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!enabled || event.pointerType === "touch") return;

      position.x = event.clientX;
      position.y = event.clientY;
      visible = true;

      const element = document.elementFromPoint(event.clientX, event.clientY);
      nativeCursorZone = Boolean(element?.closest(NATIVE_CURSOR_SELECTOR));
      interactive = !nativeCursorZone && Boolean(element?.closest(INTERACTIVE_SELECTOR));
      updateCursor();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!enabled || event.pointerType === "touch" || nativeCursorZone) return;
      pressed = true;
      updateCursor();
      pulseRef.current?.animate(
        [
          { opacity: 0.8, transform: "scale(0.35)" },
          { opacity: 0, transform: "scale(1.65)" },
        ],
        { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" },
      );
    };

    const handlePointerUp = () => {
      pressed = false;
      updateCursor();
    };

    const handlePointerLeave = () => {
      visible = false;
      updateCursor();
    };

    const handleVisibilityChange = () => updateCursor();

    setAvailability();
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    document.addEventListener("mouseleave", handlePointerLeave, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    finePointer.addEventListener("change", setAvailability);
    reducedMotion.addEventListener("change", setAvailability);

    return () => {
      root.classList.remove("glass-cursor-enabled");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("mouseleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      finePointer.removeEventListener("change", setAvailability);
      reducedMotion.removeEventListener("change", setAvailability);
    };
  }, []);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      <div
        ref={cursorRef}
        className="fixed left-0 top-0 z-[70] h-8 w-8 origin-[4px_3px] opacity-0 transition-[opacity,filter] duration-150 will-change-transform data-[interactive=true]:brightness-110"
      >
        <span
          ref={pulseRef}
          className="absolute left-[1px] top-0 h-7 w-7 rounded-full border border-[var(--glass-cursor-edge)] opacity-0 shadow-[0_0_18px_var(--glass-cursor-glow)]"
        />
        <svg viewBox="0 0 32 32" className="h-8 w-8 overflow-visible">
          <g fill="none" strokeLinejoin="round">
            <path
              d="M3.6 2.7 5.8 23.1l5.55-5.63 4.35 9.88 4.83-2.17-4.4-9.72 8.33-.8L3.6 2.7Z"
              stroke="var(--glass-cursor-glow, #53c5ee)"
              strokeWidth="7"
              opacity="0.22"
              style={{ filter: "blur(2.4px)" }}
            />
            <path
              d="M3.6 2.7 5.8 23.1l5.55-5.63 4.35 9.88 4.83-2.17-4.4-9.72 8.33-.8L3.6 2.7Z"
              stroke="var(--glass-cursor-glow, #53c5ee)"
              strokeWidth="3.8"
              opacity="0.48"
            />
          </g>
          <g>
            <path
              d="M3.6 2.7 5.8 23.1l5.55-5.63 4.35 9.88 4.83-2.17-4.4-9.72 8.33-.8L3.6 2.7Z"
              fill="var(--glass-cursor-core, #02080d)"
              stroke="var(--glass-cursor-edge, #bdeaff)"
              strokeWidth="1.55"
              strokeLinejoin="round"
            />
            <path
              d="m5.45 5.75 1.42 13.28 4.97-4.9 9.13-.88L5.45 5.75Z"
              fill="none"
              stroke="var(--glass-cursor-highlight)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="0.65"
              opacity="0.72"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

export default GlassCursor;
