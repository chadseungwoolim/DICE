"use client";
// Android only: files sent to the app from the system share sheet (see ShareTargetPlugin.java).
import { registerPlugin, Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { isNative } from "./platform";

type Shared = { uri: string | null; name?: string; type?: string };
type Plugin = {
  getPending(): Promise<Shared>;
  addListener(ev: "shared", cb: (s: Shared) => void): Promise<PluginListenerHandle>;
};

let plugin: Plugin | null = null;
function p(): Plugin {
  if (!plugin) plugin = registerPlugin<Plugin>("ShareTarget");
  return plugin;
}

async function toFile(s: Shared): Promise<File | null> {
  if (!s.uri) return null;
  const res = await fetch(Capacitor.convertFileSrc(s.uri));
  if (!res.ok) throw new Error(`shared file unreadable (${res.status})`);
  const b = await res.blob();
  return new File([b], s.name || "shared", { type: s.type || b.type });
}

/** Calls onFile for a pending share and for every later one. Returns an unsubscribe function. */
export function listenShared(onFile: (f: File) => void, onError: (m: string) => void): () => void {
  if (!isNative()) return () => {};
  let dead = false;
  let handle: PluginListenerHandle | null = null;
  const deliver = async (s: Shared) => {
    try {
      const f = await toFile(s);
      if (f && !dead) onFile(f);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  p().getPending().then(deliver).catch(() => {});
  p()
    .addListener("shared", deliver)
    .then((h) => {
      if (dead) h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    dead = true;
    handle?.remove();
  };
}

/* A shared file may arrive while another page is open: ShareInbox (layout) stores it here and routes to "/",
 * where Compressor picks it up on mount (or via the event when it is already mounted). */
let inbox: File | null = null;
export const SHARED_EVENT = "ak:shared";
export function putInbox(f: File) {
  inbox = f;
  window.dispatchEvent(new Event(SHARED_EVENT));
}
export function takeInbox(): File | null {
  const f = inbox;
  inbox = null;
  return f;
}
