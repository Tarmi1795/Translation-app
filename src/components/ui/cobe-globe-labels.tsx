"use client";

import createGlobe from "cobe";
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface LabelMarker {
  id: string;
  location: [number, number];
  text: string;
  color: string;
  rotate: number;
}

interface GlobeLabelsProps {
  markers?: LabelMarker[];
  className?: string;
  speed?: number;
  theme?: "light" | "dark";
  accessibleLabel?: string;
}

const defaultMarkers: LabelMarker[] = [
  { id: "doha", location: [25.29, 51.53], text: "Translate · ترجمة", color: "#1677a6", rotate: -4 },
  { id: "riyadh", location: [24.71, 46.68], text: "Accurate · دقيق", color: "#13725b", rotate: 4 },
  { id: "cairo", location: [30.04, 31.24], text: "Clarity · وضوح", color: "#17365d", rotate: -3 },
  { id: "london", location: [51.51, -0.13], text: "Document · مستند", color: "#6f4f8e", rotate: 3 },
  { id: "paris", location: [48.86, 2.35], text: "Meaning · معنى", color: "#287a8d", rotate: -5 },
  { id: "new-york", location: [40.71, -74.01], text: "Review · مراجعة", color: "#315f8f", rotate: 4 },
  { id: "singapore", location: [1.35, 103.82], text: "Fluent · طليق", color: "#0f7a6d", rotate: -3 },
  { id: "sydney", location: [-33.87, 151.21], text: "Approve · اعتماد", color: "#73598f", rotate: 5 },
];

export function GlobeLabels({
  markers = defaultMarkers,
  className = "",
  speed = 0.003,
  theme = "light",
  accessibleLabel = "Interactive globe showing English and Arabic translation words around the world",
}: GlobeLabelsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const phiOffsetRef = useRef(0);
  const thetaOffsetRef = useRef(0);
  const isPausedRef = useRef(false);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointerInteracting.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.style.cursor = "grabbing";
    isPausedRef.current = true;
  }, []);

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi;
      thetaOffsetRef.current = Math.max(
        -0.55,
        Math.min(0.55, thetaOffsetRef.current + dragOffset.current.theta),
      );
      dragOffset.current = { phi: 0, theta: 0 };
    }

    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    isPausedRef.current = false;
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (pointerInteracting.current === null) return;
      dragOffset.current = {
        phi: (event.clientX - pointerInteracting.current.x) / 300,
        theta: (event.clientY - pointerInteracting.current.y) / 1000,
      };
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerUp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let globe: ReturnType<typeof createGlobe> | null = null;
    let animationId: number | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    // Start over Europe and the Middle East so bilingual labels are visible immediately.
    let phi = 1.05;
    let destroyed = false;
    let onScreen = true;
    let tabVisible = document.visibilityState !== "hidden";
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const palette =
      theme === "dark"
        ? {
            dark: 1,
            diffuse: 1.35,
            mapBrightness: 11,
            baseColor: [0.08, 0.17, 0.24] as [number, number, number],
            markerColor: [0.36, 0.73, 0.87] as [number, number, number],
            glowColor: [0.06, 0.15, 0.22] as [number, number, number],
          }
        : {
            dark: 0,
            diffuse: 1.5,
            mapBrightness: 7,
            baseColor: [0.9, 0.96, 1] as [number, number, number],
            markerColor: [0.08, 0.47, 0.65] as [number, number, number],
            glowColor: [0.82, 0.94, 1] as [number, number, number],
          };

    const stopAnimation = () => {
      if (animationId !== null) cancelAnimationFrame(animationId);
      animationId = null;
    };

    const animate = () => {
      if (destroyed || !globe || !onScreen || !tabVisible) {
        animationId = null;
        return;
      }

      if (!isPausedRef.current && !motionQuery.matches) phi += speed;
      globe.update({
        phi: phi + phiOffsetRef.current + dragOffset.current.phi,
        theta: Math.max(
          -0.6,
          Math.min(0.6, 0.18 + thetaOffsetRef.current + dragOffset.current.theta),
        ),
      });
      animationId = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (!destroyed && globe && onScreen && tabVisible && animationId === null) {
        animationId = requestAnimationFrame(animate);
      }
    };

    const init = () => {
      if (destroyed || globe || canvas.offsetWidth === 0) return;
      const size = canvas.offsetWidth;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      globe = createGlobe(canvas, {
        devicePixelRatio: pixelRatio,
        width: size * pixelRatio,
        height: size * pixelRatio,
        phi: 0,
        theta: 0.18,
        dark: palette.dark,
        diffuse: palette.diffuse,
        mapSamples: 16000,
        mapBrightness: palette.mapBrightness,
        baseColor: palette.baseColor,
        markerColor: palette.markerColor,
        glowColor: palette.glowColor,
        markerElevation: 0.025,
        scale: 0.96,
        markers: markers.map((marker) => ({
          location: marker.location,
          size: 0.028,
          id: marker.id,
        })),
        arcs: [
          { from: markers[0]?.location ?? [25.29, 51.53], to: markers[3]?.location ?? [51.51, -0.13] },
          { from: markers[2]?.location ?? [30.04, 31.24], to: markers[5]?.location ?? [40.71, -74.01] },
          { from: markers[1]?.location ?? [24.71, 46.68], to: markers[6]?.location ?? [1.35, 103.82] },
        ],
        arcColor: palette.markerColor,
        arcWidth: 0.42,
        arcHeight: 0.2,
        opacity: 0.92,
      });

      revealTimer = setTimeout(() => {
        if (!destroyed) canvas.style.opacity = "1";
      }, 40);
      startAnimation();
    };

    resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0) return;
      if (!globe) {
        init();
        return;
      }
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      globe.update({ width: width * pixelRatio, height: width * pixelRatio });
    });
    resizeObserver.observe(canvas);

    intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
        if (onScreen) startAnimation();
        else stopAnimation();
      },
      { threshold: 0.08 },
    );
    intersectionObserver.observe(canvas);

    const handleVisibility = () => {
      tabVisible = document.visibilityState !== "hidden";
      if (tabVisible) startAnimation();
      else stopAnimation();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    init();

    return () => {
      destroyed = true;
      stopAnimation();
      if (revealTimer) clearTimeout(revealTimer);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      globe?.destroy();
      globe = null;
    };
  }, [markers, speed, theme]);

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={accessibleLabel}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 700ms ease",
          borderRadius: "50%",
          touchAction: "none",
        }}
      />

      {markers.map((marker) => {
        const markerStyle = {
          position: "absolute",
          positionAnchor: `--cobe-${marker.id}`,
          bottom: "anchor(top)",
          left: "anchor(center)",
          translate: "-50% 0",
          marginBottom: -7,
          padding: "0.38rem 0.62rem 0.34rem",
          background: marker.color,
          color: "#fff",
          fontSize: "clamp(0.68rem, 1.5vw, 0.82rem)",
          fontWeight: 700,
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
          transform: `rotate(${marker.rotate}deg)`,
          border: "1px solid rgba(255,255,255,0.24)",
          borderRadius: 8,
          boxShadow:
            "0 8px 24px rgba(7, 19, 32, 0.22), inset 0 1px 0 rgba(255,255,255,0.3)",
          textShadow: "0 1px 1px rgba(0,0,0,0.24)",
          pointerEvents: "none",
          overflow: "hidden",
          opacity: `var(--cobe-visible-${marker.id}, 0)`,
          filter: `blur(calc((1 - var(--cobe-visible-${marker.id}, 0)) * 8px))`,
          transition: "opacity 300ms ease, filter 300ms ease",
        } as CSSProperties;

        return (
          <div key={marker.id} aria-hidden="true" dir="ltr" style={markerStyle}>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: "0 0 50%",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.04))",
                pointerEvents: "none",
              }}
            />
            <span className="relative">{marker.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export default GlobeLabels;
