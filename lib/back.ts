"use client";
// Android back button: closes the top-most open sheet first; otherwise behaves like the default
// (history back, or leave the app on the first page). Web: no-op.
import { useEffect } from "react";
import { isNative } from "./platform";

const stack: (() => void)[] = [];
let installed = false;

async function install() {
  if (installed || !isNative()) return;
  installed = true;
  const { App } = await import("@capacitor/app");
  App.addListener("backButton", ({ canGoBack }) => {
    const top = stack[stack.length - 1];
    if (top) top();
    else if (canGoBack) window.history.back();
    else App.exitApp();
  });
}

/** While mounted, the back button calls onBack (used by full-screen sheets). */
export function useBackClose(onBack: () => void) {
  useEffect(() => {
    install();
    stack.push(onBack);
    return () => {
      const i = stack.lastIndexOf(onBack);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [onBack]);
}

export function installBack() {
  install();
}
