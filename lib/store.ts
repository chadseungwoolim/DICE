"use client";
// Minimal Supabase Storage client over plain fetch/XHR (no SDK).
// Bucket "media" (public read). Objects are named by share id:
//   t + 10 chars  -> .ak image (application/octet-stream)
//   w + 10 chars  -> video/webm
//   m + 10 chars  -> video/mp4

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const BUCKET = "media";
export const ID_RE = /^[twm][A-Za-z0-9]{10}$/;

export const storageReady = () => !!SUPABASE_URL && !!KEY;

export function publicUrl(id: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${id}`;
}

export function newId(kind: "t" | "w" | "m") {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const r = new Uint8Array(10);
  crypto.getRandomValues(r);
  let s = kind;
  for (let i = 0; i < 10; i++) s += abc[r[i] % abc.length];
  return s;
}

export function kindOf(id: string): "image" | "video" {
  return id[0] === "t" ? "image" : "video";
}
export function mimeOf(id: string) {
  return id[0] === "t" ? "application/octet-stream" : id[0] === "w" ? "video/webm" : "video/mp4";
}
export function extOf(id: string) {
  return id[0] === "t" ? "ak" : id[0] === "w" ? "webm" : "mp4";
}

/* ---- anonymous session (optional; enables deleting own uploads) ---- */
type Sess = { access_token: string; refresh_token: string; expires_at: number };
const SESS_KEY = "ak.session";
const ANON_OFF = "ak.anon.off";

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function authFetch(path: string, body: unknown): Promise<Sess | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.access_token) return null;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
  };
}

export async function session(): Promise<Sess | null> {
  const store = ls();
  let s: Sess | null = null;
  try {
    s = JSON.parse(store?.getItem(SESS_KEY) || "null");
  } catch {
    s = null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (s && s.expires_at - 60 > now) return s;
  if (s?.refresh_token) {
    const r = await authFetch("token?grant_type=refresh_token", { refresh_token: s.refresh_token }).catch(() => null);
    if (r) {
      store?.setItem(SESS_KEY, JSON.stringify(r));
      return r;
    }
  }
  const off = Number(store?.getItem(ANON_OFF) || 0);
  if (off && now - off < 86400) return null;
  const a = await authFetch("signup", { data: {} }).catch(() => null);
  if (a) {
    store?.setItem(SESS_KEY, JSON.stringify(a));
    store?.removeItem(ANON_OFF);
    return a;
  }
  store?.setItem(ANON_OFF, String(now));
  return null;
}

/** Upload with real progress (XHR). Resolves with whether the object is owned (deletable). */
export async function upload(id: string, blob: Blob, onProgress?: (f: number) => void): Promise<{ owned: boolean }> {
  if (!storageReady()) throw new Error("storage not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)");
  const s = await session();
  const token = s?.access_token || KEY;
  await new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${id}`);
    x.setRequestHeader("apikey", KEY);
    x.setRequestHeader("authorization", `Bearer ${token}`);
    x.setRequestHeader("content-type", mimeOf(id));
    x.setRequestHeader("cache-control", "max-age=31536000");
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) resolve();
      else {
        let msg = x.responseText;
        try {
          const j = JSON.parse(x.responseText);
          msg = j.message || j.error || msg;
        } catch {}
        reject(new Error(`upload failed (${x.status}): ${msg}`));
      }
    };
    x.onerror = () => reject(new Error("network error during upload"));
    x.send(blob);
  });
  return { owned: !!s };
}

export async function remove(id: string): Promise<void> {
  const s = await session();
  if (!s) throw new Error("no session: anonymous sign-in is disabled, delete not possible");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${id}`, {
    method: "DELETE",
    headers: { apikey: KEY, authorization: `Bearer ${s.access_token}` },
  });
  if (!res.ok) throw new Error(`delete failed (${res.status}): ${await res.text()}`);
}

/* ---- local list of links created in this browser ---- */
export type ShareRec = {
  id: string;
  size: number;
  orig: number;
  name: string;
  created: number;
  thumb: string;
  owned: boolean;
  info: string;
};
const LIST = "ak.shares";

export function listShares(): ShareRec[] {
  try {
    return JSON.parse(ls()?.getItem(LIST) || "[]");
  } catch {
    return [];
  }
}
export function saveShares(v: ShareRec[]) {
  try {
    ls()?.setItem(LIST, JSON.stringify(v.slice(0, 200)));
  } catch {}
}
export function addShare(r: ShareRec) {
  saveShares([r, ...listShares().filter((x) => x.id !== r.id)]);
}
export function shareLink(id: string) {
  return `${window.location.origin}/v/${id}`;
}
