"use client";
// Hidden lab menu (Compress / Share / Experiment). Unlocked by tapping the logo 5 times; remembered per device.
import { useSyncExternalStore } from "react";

const KEY = "ak.lab";
const EV = "ak:lab";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setLab(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EV));
}
export function useLab(): boolean {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener(EV, f);
      window.addEventListener("storage", f);
      return () => {
        window.removeEventListener(EV, f);
        window.removeEventListener("storage", f);
      };
    },
    read,
    () => false
  );
}

let taps: number[] = [];
/** Call on every logo tap; returns the new state when the 5th tap within 3 s toggles the lab, else null. */
export function secretTap(): boolean | null {
  const now = Date.now();
  taps = [...taps.filter((t) => now - t < 3000), now];
  if (taps.length >= 5) {
    taps = [];
    const next = !read();
    setLab(next);
    return next;
  }
  return null;
}
