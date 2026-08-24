"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* Adapted from Motiq's Decrypt Text component (MIT licensed). */

export type DecryptTextTrigger = "mount" | "inview" | "hover";
export type DecryptTextVariant = "display" | "terminal";

export interface DecryptTextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  text: string;
  glyphs?: string;
  speed?: number;
  stagger?: number;
  startDelay?: number;
  jitter?: number;
  trigger?: DecryptTextTrigger;
  variant?: DecryptTextVariant;
  loop?: number | false;
  retriggerOnHover?: boolean;
  replayOnReentry?: boolean;
  seed?: number;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";
  reducedMotion?: boolean;
  onDecrypted?: () => void;
}

interface CharItem {
  i: number;
  ch: string;
}

const POOL_DISPLAY = "#%&@$?!+=/{}[]<>~^";
const POOL_TERMINAL = "abcdef0123456789$#%&+=/|_~";
const HOVER_COOLDOWN = 1500;
const CYCLE_SPREAD = 35;

function useReducedMotion(): boolean {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => onStoreChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const getSnapshot = React.useCallback(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function useOnScreen<T extends Element>(
  ref: React.RefObject<T | null>,
  threshold = 0.1,
): boolean {
  const [onScreen, setOnScreen] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      const fallback = window.setTimeout(() => setOnScreen(true), 0);
      return () => window.clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries.some((entry) => entry.isIntersecting)),
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return onScreen;
}

function useTabVisible(): boolean {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    document.addEventListener("visibilitychange", onStoreChange);
    return () => document.removeEventListener("visibilitychange", onStoreChange);
  }, []);

  const getSnapshot = React.useCallback(
    () => document.visibilityState !== "hidden",
    [],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, () => true);
}

function makeRng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result =
      (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function DecryptText({
  text,
  glyphs,
  speed = 45,
  stagger = 55,
  startDelay = 350,
  jitter = 120,
  trigger = "inview",
  variant = "display",
  loop = 7000,
  retriggerOnHover = true,
  replayOnReentry = false,
  seed = 1,
  as: Tag = "p",
  reducedMotion,
  onDecrypted,
  className,
  ...rest
}: DecryptTextProps) {
  const rootRef = React.useRef<HTMLElement | null>(null);
  const charRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
  const rafRef = React.useRef<number | null>(null);
  const frameRef = React.useRef<(() => void) | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerDueAtRef = React.useRef<number | null>(null);
  const timerRemainingRef = React.useRef<number | null>(null);
  const playRef = React.useRef<(force?: boolean) => void>(() => undefined);
  const lastStartRef = React.useRef(-Infinity);
  const playedRef = React.useRef(false);
  const runningRef = React.useRef(false);
  const activeRef = React.useRef(false);
  const reducedRef = React.useRef(false);
  const pausedAtRef = React.useRef<number | null>(null);
  const pausedDurationRef = React.useRef(0);
  const hasEnteredRef = React.useRef(false);
  const previousOnScreenRef = React.useRef(false);
  const wasReducedRef = React.useRef(false);
  const runRef = React.useRef(0);
  const onDecryptedRef = React.useRef(onDecrypted);

  React.useEffect(() => {
    onDecryptedRef.current = onDecrypted;
  }, [onDecrypted]);

  const systemReduced = useReducedMotion();
  const reduceNow = reducedMotion ?? systemReduced;
  const onScreen = useOnScreen(rootRef, 0.12);
  const tabVisible = useTabVisible();
  const terminal = variant === "terminal";
  const pool =
    glyphs && glyphs.length > 0
      ? glyphs
      : terminal
        ? POOL_TERMINAL
        : POOL_DISPLAY;

  const words = React.useMemo(() => {
    const output: CharItem[][] = [];
    let index = 0;

    for (const word of text.split(" ")) {
      const characters: CharItem[] = [];
      for (const character of Array.from(word)) {
        characters.push({ i: index, ch: character });
        index += 1;
      }
      output.push(characters);
    }

    return output;
  }, [text]);

  const total = React.useMemo(
    () => words.reduce((count, word) => count + word.length, 0),
    [words],
  );

  const cancelFrame = React.useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const clearLoopTimer = React.useCallback((clearRemaining = true) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    timerDueAtRef.current = null;
    if (clearRemaining) timerRemainingRef.current = null;
  }, []);

  const resolveAll = React.useCallback(() => {
    for (const element of charRefs.current) {
      if (!element) continue;
      element.textContent = element.dataset.decryptChar ?? element.textContent;
      element.dataset.state = "plain";
    }
  }, []);

  const markStatus = React.useCallback(
    (status: "running" | "paused" | "resolved" | "static") => {
      if (!rootRef.current) return;
      rootRef.current.dataset.decryptStatus = status;
      rootRef.current.dataset.decryptRuns = String(runRef.current);
    },
    [],
  );

  const cancelAnimation = React.useCallback(
    (resolve = true) => {
      cancelFrame();
      frameRef.current = null;
      runningRef.current = false;
      pausedAtRef.current = null;
      pausedDurationRef.current = 0;
      if (resolve) resolveAll();
      markStatus(reducedRef.current ? "static" : "resolved");
    },
    [cancelFrame, markStatus, resolveAll],
  );

  const pauseAnimation = React.useCallback(() => {
    if (!runningRef.current || pausedAtRef.current !== null) return;
    cancelFrame();
    pausedAtRef.current = performance.now();
    markStatus("paused");
  }, [cancelFrame, markStatus]);

  const resumeAnimation = React.useCallback(() => {
    if (
      !runningRef.current ||
      pausedAtRef.current === null ||
      frameRef.current === null
    ) {
      return false;
    }

    pausedDurationRef.current += performance.now() - pausedAtRef.current;
    pausedAtRef.current = null;
    markStatus("running");
    rafRef.current = requestAnimationFrame(frameRef.current);
    return true;
  }, [markStatus]);

  const pauseLoopTimer = React.useCallback(() => {
    if (timerRef.current === null || timerDueAtRef.current === null) return;
    timerRemainingRef.current = Math.max(
      0,
      timerDueAtRef.current - performance.now(),
    );
    clearLoopTimer(false);
  }, [clearLoopTimer]);

  const scheduleLoop = React.useCallback(
    (delay = loop === false ? 0 : loop) => {
      clearLoopTimer();
      if (loop === false || loop <= 0) return;

      const safeDelay = Math.max(0, delay);
      if (!activeRef.current || reducedRef.current) {
        timerRemainingRef.current = safeDelay;
        return;
      }

      timerDueAtRef.current = performance.now() + safeDelay;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        timerDueAtRef.current = null;
        timerRemainingRef.current = null;
        playRef.current();
      }, safeDelay);
    },
    [clearLoopTimer, loop],
  );

  const play = React.useCallback((force = false) => {
    if (reducedRef.current || !activeRef.current) return;
    if (runningRef.current && !force) return;

    clearLoopTimer();
    if (runningRef.current) cancelAnimation(false);

    const rng = makeRng(seed + runRef.current * 7919);
    runRef.current += 1;

    const cells = charRefs.current.filter(
      (element): element is HTMLSpanElement => element !== null,
    );
    if (cells.length === 0 || pool.length === 0) return;

    lastStartRef.current = performance.now();
    playedRef.current = true;
    runningRef.current = true;
    pausedAtRef.current = null;
    pausedDurationRef.current = 0;
    markStatus("running");

    const lockAt = new Float64Array(cells.length);
    const nextAt = new Float64Array(cells.length);
    const locked = new Uint8Array(cells.length);

    cells.forEach((element, index) => {
      lockAt[index] =
        startDelay + index * stagger + (rng() * 2 - 1) * jitter;
      nextAt[index] = 0;
      element.dataset.state = "scramble";
      element.textContent = pool.charAt((rng() * pool.length) | 0);
    });

    let remaining = cells.length;
    const startedAt = performance.now();

    const frame = () => {
      if (!activeRef.current || reducedRef.current) return;
      const now =
        performance.now() - startedAt - pausedDurationRef.current;

      cells.forEach((element, index) => {
        if (locked[index]) return;

        if (now >= (lockAt[index] ?? 0)) {
          element.textContent = element.dataset.decryptChar ?? "";
          element.dataset.state = "lock";
          locked[index] = 1;
          remaining -= 1;
        } else if (now >= (nextAt[index] ?? 0)) {
          element.textContent = pool.charAt((rng() * pool.length) | 0);
          nextAt[index] = now + speed + rng() * CYCLE_SPREAD;
        }
      });

      if (remaining <= 0) {
        rafRef.current = null;
        frameRef.current = null;
        runningRef.current = false;
        pausedAtRef.current = null;
        pausedDurationRef.current = 0;
        markStatus("resolved");
        onDecryptedRef.current?.();
        scheduleLoop();
        return;
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    frameRef.current = frame;
    rafRef.current = requestAnimationFrame(frame);
  }, [cancelAnimation, clearLoopTimer, jitter, markStatus, pool, scheduleLoop, seed, speed, stagger, startDelay]);

  React.useEffect(() => {
    playRef.current = play;
  }, [play]);

  React.useLayoutEffect(() => {
    const wasOnScreen = previousOnScreenRef.current;
    const hadEntered = hasEnteredRef.current;
    const reentered = onScreen && !wasOnScreen && hadEntered;
    const wasReduced = wasReducedRef.current;

    previousOnScreenRef.current = onScreen;
    if (onScreen) hasEnteredRef.current = true;
    wasReducedRef.current = reduceNow;
    activeRef.current = onScreen && tabVisible;
    reducedRef.current = reduceNow;

    if (reduceNow) {
      clearLoopTimer();
      cancelAnimation(true);
      markStatus("static");
      return;
    }

    if (!activeRef.current) {
      pauseLoopTimer();
      pauseAnimation();
      return;
    }

    if (reentered && replayOnReentry) {
      clearLoopTimer();
      cancelAnimation(false);
      play(true);
      return;
    }

    if (resumeAnimation()) return;

    if (timerRemainingRef.current !== null) {
      const remaining = timerRemainingRef.current;
      timerRemainingRef.current = null;
      scheduleLoop(remaining);
      return;
    }

    if (!playedRef.current) {
      if (trigger === "hover") {
        resolveAll();
        markStatus("resolved");
      } else if (trigger === "mount" || (trigger === "inview" && onScreen)) {
        play();
      }
      return;
    }

    if (
      wasReduced &&
      loop !== false &&
      loop > 0 &&
      timerRef.current === null
    ) {
      scheduleLoop();
    }
  }, [cancelAnimation, clearLoopTimer, loop, markStatus, onScreen, pauseAnimation, pauseLoopTimer, play, reduceNow, replayOnReentry, resolveAll, resumeAnimation, scheduleLoop, tabVisible, trigger]);

  React.useEffect(
    () => () => {
      activeRef.current = false;
      clearLoopTimer();
      cancelAnimation(true);
      playedRef.current = false;
      hasEnteredRef.current = false;
      previousOnScreenRef.current = false;
    },
    [cancelAnimation, clearLoopTimer],
  );

  const onPointerEnter = React.useCallback(() => {
    if (
      reduceNow ||
      !retriggerOnHover ||
      !activeRef.current ||
      runningRef.current
    ) {
      return;
    }
    if (performance.now() - lastStartRef.current < HOVER_COOLDOWN) return;
    play();
  }, [play, reduceNow, retriggerOnHover]);

  let cursor = -1;
  const glyphLayer = (
    <span aria-hidden="true" className="select-none">
      {words.map((word, wordIndex) => (
        <React.Fragment key={wordIndex}>
          <span className="inline-block whitespace-pre">
            {word.map((item) => {
              cursor += 1;
              const refIndex = cursor;
              return (
                <span
                  key={item.i}
                  data-decrypt-char={item.ch}
                  data-state="plain"
                  ref={(element) => {
                    charRefs.current[refIndex] = element;
                  }}
                >
                  {item.ch}
                </span>
              );
            })}
          </span>
          {wordIndex < words.length - 1 ? (
            <span aria-hidden="true" className="inline-block w-[0.24em]" />
          ) : null}
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <Tag
      ref={rootRef as React.Ref<never>}
      data-motion={reduceNow ? "static" : "animated"}
      data-variant={variant}
      data-chars={total}
      onPointerEnter={onPointerEnter}
      className={cn(
        "decrypt-text",
        terminal
          ? "inline-block font-mono text-[clamp(0.78rem,2.4vw,1rem)] leading-relaxed"
          : "inline text-balance text-[clamp(1.6rem,5.2vw,3.3rem)] font-extrabold leading-[1.15] tracking-[-0.02em]",
        className,
      )}
      {...rest}
    >
      <span className="sr-only">{text}</span>
      {terminal ? (
        <span
          className={cn(
            "inline-flex max-w-full flex-wrap items-baseline gap-x-1 rounded-xl border bg-[var(--surface-raised)] px-4 py-3 align-middle shadow-[var(--shadow-md)]",
          )}
        >
          <span aria-hidden="true" className="text-[var(--success)]">
            $
          </span>
          {glyphLayer}
          <span
            aria-hidden="true"
            data-decrypt-caret=""
            className="inline-block h-[1.05em] w-[0.55em] bg-[var(--success)] align-text-bottom"
          />
        </span>
      ) : (
        <span className="inline">{glyphLayer}</span>
      )}
    </Tag>
  );
}

DecryptText.displayName = "DecryptText";

export default DecryptText;
