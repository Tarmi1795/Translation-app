"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface Point {
  x: number;
  y: number;
}

export interface GlassCursorProps {
  className?: string;
  trailLength?: number;
  dampening?: number;
}

const INTERACTIVE_SELECTOR = "a, button, [role='button'], [data-cursor-interactive]";
const NATIVE_CURSOR_SELECTOR = "input, textarea, select, [contenteditable='true'], canvas";

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * A clean-room glass cursor inspired by the supplied reference.
 * It keeps a crisp black arrow at the pointer hotspot while a thick, layered
 * cyan-white refractive ribbon follows fast movement and collapses at rest.
 */
export function GlassCursor({ className, trailLength = 20, dampening = 0.31 }: GlassCursorProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const cursorRef = React.useRef<HTMLDivElement>(null);
  const pulseRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    if (!canvas || !cursor) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const root = document.documentElement;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointCount = Math.max(8, Math.min(24, trailLength));
    const points: Point[] = Array.from({ length: pointCount }, () => ({ x: -80, y: -80 }));
    const target = { x: -80, y: -80 };
    const previousTarget = { x: -80, y: -80 };

    let enabled = false;
    let visible = false;
    let pressed = false;
    let interactive = false;
    let nativeCursorZone = false;
    let motionEnergy = 0;
    let animationFrame: number | null = null;
    let devicePixelRatio = 1;

    const resizeCanvas = () => {
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * devicePixelRatio);
      canvas.height = Math.round(window.innerHeight * devicePixelRatio);
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };

    const setCursorTransform = () => {
      const scale = pressed ? 0.84 : interactive ? 1.13 : 1;
      cursor.style.transform = `translate3d(${target.x - 4}px, ${target.y - 3}px, 0) scale(${scale})`;
      cursor.style.opacity = visible && !nativeCursorZone ? "1" : "0";
      cursor.dataset.interactive = interactive ? "true" : "false";
    };

    const clearCanvas = () => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const drawTrail = () => {
      clearCanvas();
      if (!visible || nativeCursorZone || motionEnergy < 0.012) {
        canvas.style.opacity = "0";
        return;
      }

      const styles = getComputedStyle(root);
      const glow = styles.getPropertyValue("--glass-cursor-glow-rgb").trim() || "83 197 238";
      const ice = styles.getPropertyValue("--glass-cursor-ice-rgb").trim() || "226 248 255";
      const core = styles.getPropertyValue("--glass-cursor-core").trim() || "#02080d";
      const energy = Math.min(1, motionEnergy);
      canvas.style.opacity = String(Math.min(0.94, 0.12 + energy * 0.92));
      context.lineCap = "round";
      context.lineJoin = "round";

      for (let index = points.length - 2; index >= 0; index -= 1) {
        const from = points[index + 1];
        const to = points[index];
        const progress = 1 - index / (points.length - 1);
        const alpha = Math.pow(progress, 1.42) * energy;
        const segmentLength = Math.max(0.001, distance(from, to));
        const normalX = -(to.y - from.y) / segmentLength;
        const normalY = (to.x - from.x) / segmentLength;
        const swell = 0.76 + energy * 0.36;

        // A translucent dark membrane gives the trail visible volume, while
        // the following offset layers read like reflected light in moving water.
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = alpha * 0.22;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.lineWidth = (7 + progress * 19) * swell;
        context.strokeStyle = core;
        context.shadowColor = `rgb(${glow} / ${alpha * 0.62})`;
        context.shadowBlur = 10 + progress * 20;
        context.stroke();

        context.globalAlpha = 1;
        context.globalCompositeOperation = "lighter";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.lineWidth = (5.5 + progress * 16) * swell;
        context.strokeStyle = `rgb(${glow} / ${alpha * 0.2})`;
        context.shadowColor = `rgb(${glow} / ${alpha * 0.96})`;
        context.shadowBlur = 14 + progress * 23;
        context.stroke();

        // Offset the inner band toward one edge to mimic a refracted rim.
        context.beginPath();
        context.moveTo(from.x + normalX * 0.8, from.y + normalY * 0.8);
        context.lineTo(to.x + normalX * 0.8, to.y + normalY * 0.8);
        context.lineWidth = (2.4 + progress * 8.5) * swell;
        context.strokeStyle = `rgb(${ice} / ${alpha * 0.25})`;
        context.shadowColor = `rgb(${ice} / ${alpha * 0.78})`;
        context.shadowBlur = 7 + progress * 12;
        context.stroke();

        context.beginPath();
        context.moveTo(from.x + normalX * 1.7, from.y + normalY * 1.7);
        context.lineTo(to.x + normalX * 1.7, to.y + normalY * 1.7);
        context.lineWidth = 0.9 + progress * 3.6;
        context.strokeStyle = `rgb(${ice} / ${alpha * 0.58})`;
        context.shadowBlur = 3 + progress * 6;
        context.stroke();

        // Small deterministic beads break up the ribbon edge during quicker
        // movement, giving it a liquid surface without adding random jitter.
        if (energy > 0.24 && index % 4 === 1 && progress < 0.78) {
          const side = index % 8 === 1 ? 1 : -1;
          const radius = (1.2 + progress * 3.1) * energy;
          const beadX = to.x + normalX * side * (4 + progress * 4.5);
          const beadY = to.y + normalY * side * (4 + progress * 4.5);
          const bead = context.createRadialGradient(
            beadX - radius * 0.35,
            beadY - radius * 0.35,
            0,
            beadX,
            beadY,
            radius,
          );
          bead.addColorStop(0, `rgb(${ice} / ${alpha * 0.62})`);
          bead.addColorStop(0.45, `rgb(${glow} / ${alpha * 0.2})`);
          bead.addColorStop(1, `rgb(${glow} / 0)`);
          context.fillStyle = bead;
          context.shadowBlur = 8;
          context.beginPath();
          context.arc(beadX, beadY, radius, 0, Math.PI * 2);
          context.fill();
        }
      }

      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    };

    const render = () => {
      animationFrame = null;
      if (!enabled || document.hidden) return;

      const movement = distance(target, previousTarget);
      motionEnergy = Math.max(Math.min(1, movement / 22), motionEnergy * 0.89);
      previousTarget.x = target.x;
      previousTarget.y = target.y;

      points[0].x += (target.x - points[0].x) * 0.72;
      points[0].y += (target.y - points[0].y) * 0.72;
      for (let index = 1; index < points.length; index += 1) {
        const lead = points[index - 1];
        const follow = Math.max(0.12, dampening - index * 0.0075);
        points[index].x += (lead.x - points[index].x) * follow;
        points[index].y += (lead.y - points[index].y) * follow;
      }

      setCursorTransform();
      drawTrail();
      const settled =
        motionEnergy < 0.012 &&
        points.every((point) => Math.abs(point.x - target.x) < 0.5 && Math.abs(point.y - target.y) < 0.5);
      if (settled) {
        clearCanvas();
        canvas.style.opacity = "0";
        return;
      }
      animationFrame = requestAnimationFrame(render);
    };

    const start = () => {
      if (!enabled || animationFrame != null || document.hidden) return;
      animationFrame = requestAnimationFrame(render);
    };

    const stop = () => {
      if (animationFrame != null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      clearCanvas();
    };

    const setAvailability = () => {
      enabled = finePointer.matches && !reducedMotion.matches;
      root.classList.toggle("glass-cursor-enabled", enabled);
      if (enabled) {
        resizeCanvas();
      } else {
        visible = false;
        cursor.style.opacity = "0";
        canvas.style.opacity = "0";
        stop();
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!enabled || event.pointerType === "touch") return;
      const firstMove = !visible;
      target.x = event.clientX;
      target.y = event.clientY;
      visible = true;

      const element = document.elementFromPoint(event.clientX, event.clientY);
      nativeCursorZone = Boolean(element?.closest(NATIVE_CURSOR_SELECTOR));
      interactive = !nativeCursorZone && Boolean(element?.closest(INTERACTIVE_SELECTOR));

      if (firstMove) {
        previousTarget.x = target.x;
        previousTarget.y = target.y;
        for (const point of points) {
          point.x = target.x;
          point.y = target.y;
        }
      }
      setCursorTransform();
      start();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!enabled || event.pointerType === "touch" || nativeCursorZone) return;
      pressed = true;
      setCursorTransform();
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
      setCursorTransform();
    };

    const handlePointerLeave = () => {
      visible = false;
      setCursorTransform();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };

    resizeCanvas();
    setAvailability();
    window.addEventListener("resize", resizeCanvas, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    document.addEventListener("mouseleave", handlePointerLeave, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    finePointer.addEventListener("change", setAvailability);
    reducedMotion.addEventListener("change", setAvailability);

    return () => {
      stop();
      root.classList.remove("glass-cursor-enabled");
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("mouseleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      finePointer.removeEventListener("change", setAvailability);
      reducedMotion.removeEventListener("change", setAvailability);
    };
  }, [dampening, trailLength]);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-[60] h-dvh w-screen opacity-0 transition-opacity duration-150"
      />
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
