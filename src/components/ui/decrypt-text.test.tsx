import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecryptText } from "@/components/ui/decrypt-text";

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observerCallback: ObserverCallback | null = null;
let visibilityState: DocumentVisibilityState = "visible";

function setIntersection(isIntersecting: boolean) {
  act(() => {
    observerCallback?.([{ isIntersecting }]);
  });
}

function setVisibility(next: DocumentVisibilityState) {
  visibilityState = next;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}

function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}

function getPlaybackState(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>(".decrypt-text");
  return {
    runs: Number(root?.dataset.decryptRuns ?? 0),
    status: root?.dataset.decryptStatus,
  };
}

function renderDecrypt(
  props: Partial<React.ComponentProps<typeof DecryptText>> = {},
) {
  const onDecrypted = vi.fn();
  const result = render(
    <React.StrictMode>
      <DecryptText
        as="span"
        text="AB"
        glyphs="غع"
        trigger="inview"
        speed={1}
        stagger={0}
        startDelay={0}
        jitter={0}
        seed={13}
        onDecrypted={onDecrypted}
        {...props}
      />
    </React.StrictMode>,
  );
  return { ...result, onDecrypted };
}

describe("DecryptText playback orchestration", () => {
  beforeEach(() => {
    observerCallback = null;
    visibilityState = "visible";
    vi.useFakeTimers();

    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
      window.clearTimeout(handle),
    );
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = (entries) =>
          callback(entries as IntersectionObserverEntry[], this as never);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "0px";
      thresholds = [0.12];
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs once on entry and starts exactly one loop after the completion delay", () => {
    const { container, onDecrypted } = renderDecrypt({ loop: 5000 });

    setIntersection(true);
    expect(getPlaybackState(container)).toEqual({ runs: 1, status: "running" });

    advance(16);
    expect(getPlaybackState(container)).toEqual({ runs: 1, status: "resolved" });
    expect(onDecrypted).toHaveBeenCalledTimes(1);

    advance(4999);
    expect(getPlaybackState(container).runs).toBe(1);

    advance(1);
    expect(getPlaybackState(container)).toEqual({ runs: 2, status: "running" });
    advance(16);
    expect(onDecrypted).toHaveBeenCalledTimes(2);

    advance(5000);
    expect(getPlaybackState(container).runs).toBe(3);
  });

  it("replays only on a genuine viewport re-entry", () => {
    const { container } = renderDecrypt({
      loop: false,
      replayOnReentry: true,
    });

    setIntersection(true);
    advance(16);
    expect(getPlaybackState(container).runs).toBe(1);

    setIntersection(true);
    expect(getPlaybackState(container).runs).toBe(1);

    setIntersection(false);
    setIntersection(true);
    expect(getPlaybackState(container)).toEqual({ runs: 2, status: "running" });

    setIntersection(true);
    expect(getPlaybackState(container).runs).toBe(2);
  });

  it("pauses a loop while hidden and resumes with only the remaining delay", () => {
    const { container } = renderDecrypt({ loop: 5000 });

    setIntersection(true);
    advance(16);
    advance(2000);
    setVisibility("hidden");
    advance(6000);
    expect(getPlaybackState(container).runs).toBe(1);

    setVisibility("visible");
    advance(2999);
    expect(getPlaybackState(container).runs).toBe(1);
    advance(1);
    expect(getPlaybackState(container).runs).toBe(2);
  });

  it("pauses and resumes an active animation frame without starting another run", () => {
    const { container, onDecrypted } = renderDecrypt({
      loop: false,
      stagger: 100,
    });

    setIntersection(true);
    setVisibility("hidden");
    expect(getPlaybackState(container)).toEqual({ runs: 1, status: "paused" });

    advance(1000);
    expect(getPlaybackState(container)).toEqual({ runs: 1, status: "paused" });
    expect(onDecrypted).not.toHaveBeenCalled();

    setVisibility("visible");
    advance(112);
    expect(getPlaybackState(container)).toEqual({ runs: 1, status: "resolved" });
    expect(onDecrypted).toHaveBeenCalledTimes(1);
  });

  it("preserves the hover cooldown and never overlaps an active run", () => {
    const { container } = renderDecrypt({ loop: false, retriggerOnHover: true });
    const root = container.querySelector<HTMLElement>(".decrypt-text");
    expect(root).not.toBeNull();

    setIntersection(true);
    advance(16);

    fireEvent.pointerEnter(root!);
    expect(getPlaybackState(container).runs).toBe(1);

    advance(1484);
    fireEvent.pointerEnter(root!);
    expect(getPlaybackState(container)).toEqual({ runs: 2, status: "running" });

    fireEvent.pointerEnter(root!);
    expect(getPlaybackState(container).runs).toBe(2);

    advance(16);
    advance(1483);
    fireEvent.pointerEnter(root!);
    expect(getPlaybackState(container).runs).toBe(2);

    advance(1);
    fireEvent.pointerEnter(root!);
    expect(getPlaybackState(container).runs).toBe(3);
  });

  it("keeps resolved screen-reader text static when motion is reduced", () => {
    const { container, onDecrypted } = renderDecrypt({
      loop: 5000,
      replayOnReentry: true,
      reducedMotion: true,
    });

    setIntersection(true);
    advance(10000);

    expect(getPlaybackState(container)).toEqual({ runs: 0, status: "static" });
    expect(container.querySelector(".sr-only")).toHaveTextContent("AB");
    expect(container.querySelectorAll("[data-decrypt-char]")[0]).toHaveTextContent("A");
    expect(container.querySelectorAll("[data-decrypt-char]")[1]).toHaveTextContent("B");
    expect(onDecrypted).not.toHaveBeenCalled();
  });
});
