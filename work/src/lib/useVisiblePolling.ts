import { useEffect, useRef } from "react";

/**
 * Drop-in replacement for setInterval that automatically pauses when the
 * browser tab is hidden and resumes (with an immediate tick) when it becomes
 * visible again. Prevents unnecessary network requests on backgrounded tabs.
 */
export function useVisiblePolling(
  fn: () => void,
  intervalMs: number,
  enabled = true,
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let timerId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timerId !== null) return;
      fnRef.current();
      timerId = setInterval(() => fnRef.current(), intervalMs);
    };

    const stop = () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState !== "hidden") start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
