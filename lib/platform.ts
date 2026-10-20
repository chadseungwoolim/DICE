// Platform helpers. The same code base runs as a website (Vercel) and as a Capacitor app (static export).
// NEXT_PUBLIC_APP_BUILD=1 is set only by scripts/build-app.mjs.

export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD === "1";
export const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL || "").replace(/\/+$/, "");

export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!c?.isNativePlatform?.();
}

/** In-app route to a shared item. The bundled app has no server, so the id travels in the query string.
 * The Capacitor asset server answers every extensionless path with the root index.html, so full page loads
 * inside the app must name the exported file explicitly (/v/index.html). */
export function viewHref(id: string): string {
  return APP_BUILD ? `/v/index.html?id=${id}` : `/v/${id}`;
}

/** App only: if the root page was served for a deeper path (reload, external jump), load the real exported page. */
export function fixAppRoute(): void {
  if (!APP_BUILD || typeof window === "undefined") return;
  const p = window.location.pathname;
  if (p === "/" || p === "/index.html" || p.endsWith(".html")) return;
  window.location.replace(p.replace(/\/?$/, "/") + "index.html" + window.location.search);
}

/** Public link that is handed to other people. Inside the app the origin is https://localhost, so WEB_URL is required. */
export function publicLink(id: string): string {
  const base = WEB_URL || (typeof window !== "undefined" && !isNative() ? window.location.origin : "");
  return `${base}/v/${id}`;
}

/** Large static assets (the ResNet-50 weights) are not bundled into the app; they are fetched from the website. */
export function assetBase(): string {
  return APP_BUILD ? WEB_URL : "";
}
