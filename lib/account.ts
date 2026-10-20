"use client";
// Number accounts (see supabase/setup-v2.sql). All calls go through RPC functions; the tables are not exposed.
import { useSyncExternalStore } from "react";
import { BUCKET_V2, supa, supaReady } from "./supa";

export type Account =
  | { status: "loading" }
  | { status: "out"; error?: string }
  | { status: "in"; number: string; me: string };

export type Msg = {
  id: string;
  box: "in" | "out";
  other: string;
  kind: "image" | "video";
  path: string;
  bytes: number;
  meta: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

/* ------------------------------------------------------------------ errors */
const KO: Record<string, string> = {
  number_taken: "이미 사용 중인 번호입니다.",
  bad_number: "번호는 숫자 4~8자리입니다.",
  bad_password: "비밀번호는 6자 이상, 72바이트 이하입니다.",
  bad_credentials: "번호 또는 비밀번호가 맞지 않습니다.",
  locked: "비밀번호를 5번 틀려서 15분 동안 잠겼습니다.",
  no_such_number: "없는 번호입니다.",
  blocked: "상대가 내 번호를 차단해서 보낼 수 없습니다.",
  rate_limited: "1시간에 200개까지 보낼 수 있습니다. 잠시 후 다시 시도해 주세요.",
  not_logged_in: "다시 로그인해 주세요.",
  file_missing: "파일 업로드가 끝나지 않았습니다. 다시 시도해 주세요.",
  bad_path: "잘못된 파일 경로입니다.",
  self: "자기 번호는 차단할 수 없습니다.",
};

export function errText(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? "");
  const code = String((e as { code?: string })?.code ?? "");
  if (KO[m]) return KO[m];
  // longest key first, so that "blocked" is not taken for "locked"
  for (const k of Object.keys(KO).sort((x, y) => y.length - x.length)) if (new RegExp(`\\b${k}\\b`).test(m)) return KO[k];
  if (/anonymous sign-ins are disabled/i.test(m)) return "서버 설정 필요: Supabase에서 익명 로그인(Allow anonymous sign-ins)을 켜 주세요.";
  if (code === "PGRST202" || /could not find the function/i.test(m)) return "서버 설정 필요: supabase/setup-v2.sql을 실행해 주세요.";
  if (/bucket not found/i.test(m)) return "서버 설정 필요: supabase/setup-v2.sql을 실행해 주세요.";
  if (/failed to fetch|network|load failed/i.test(m)) return "서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.";
  if (/exceeded the maximum allowed size|payload too large/i.test(m)) return "파일이 너무 큽니다(최대 300 KB).";
  return m || "알 수 없는 오류";
}

function unwrap<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

/* ------------------------------------------------------------------ state */
let state: Account = { status: "loading" };
const subs = new Set<() => void>();
function set(s: Account) {
  state = s;
  subs.forEach((f) => f());
}
export function useAccount(): Account {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => state
  );
}
export const getAccount = () => state;

/* Every install needs a Supabase session that stands for "this device"; the number account is linked to it by
 * ak_login / ak_signup. Preferred: an anonymous sign-in. If anonymous sign-ins are disabled in the project, fall back
 * to a throwaway e-mail user with random credentials kept on this device (works while "Confirm email" is off;
 * the .invalid domain can never receive mail). */
const DEVICE = "ak.device";
function rand(n: number) {
  const r = new Uint8Array(n);
  crypto.getRandomValues(r);
  return Array.from(r, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function deviceUser() {
  const sb = supa();
  let cred: { email: string; password: string } | null = null;
  try {
    cred = JSON.parse(localStorage.getItem(DEVICE) || "null");
  } catch {}
  if (cred) {
    const r = await sb.auth.signInWithPassword(cred);
    if (!r.error && r.data.session) return r.data.session;
  }
  cred = { email: `d${rand(10)}@device.ak.invalid`, password: rand(24) };
  const r = await sb.auth.signUp(cred);
  if (r.error) throw r.error;
  if (!r.data.session) throw new Error("서버 설정 필요: Supabase에서 익명 로그인(Allow anonymous sign-ins)을 켜거나 이메일 확인(Confirm email)을 꺼 주세요.");
  try {
    localStorage.setItem(DEVICE, JSON.stringify(cred));
  } catch {}
  return r.data.session;
}
async function ensureSession() {
  const sb = supa();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  const a = await sb.auth.signInAnonymously();
  if (!a.error && a.data.session) return a.data.session;
  const code = (a.error as { code?: string } | null)?.code || "";
  if (code === "anonymous_provider_disabled" || /anonymous sign-ins are disabled/i.test(a.error?.message || "")) return deviceUser();
  throw a.error;
}

async function refreshIdentity(): Promise<Account> {
  const sb = supa();
  const number = unwrap(await sb.rpc("ak_whoami")) as string | null;
  if (!number) return { status: "out" };
  const me = unwrap(await sb.rpc("ak_me")) as string;
  return { status: "in", number, me };
}

let started = false;
export async function initAccount(force = false) {
  if (started && !force) return;
  started = true;
  if (!supaReady()) return set({ status: "out", error: "서버 주소가 설정되지 않았습니다 (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)." });
  try {
    await ensureSession();
    set(await refreshIdentity());
  } catch (e) {
    started = false;
    set({ status: "out", error: errText(e) });
  }
}

export async function signup(number: string, password: string) {
  await ensureSession();
  unwrap(await supa().rpc("ak_signup", { p_number: number, p_password: password }));
  set(await refreshIdentity());
}

export async function login(number: string, password: string) {
  await ensureSession();
  const r = unwrap(await supa().rpc("ak_login", { p_number: number, p_password: password })) as string;
  if (r !== "ok") throw new Error(r);
  set(await refreshIdentity());
}

export async function logout() {
  try {
    await supa().rpc("ak_logout");
  } finally {
    cache.clear();
    set({ status: "out" });
  }
}

export async function changePassword(oldPw: string, newPw: string) {
  const r = unwrap(await supa().rpc("ak_change_password", { p_old: oldPw, p_new: newPw })) as string;
  if (r !== "ok") throw new Error(r);
}

/** Removes every file this account sent or received, then the account itself. */
export async function deleteAccount(password: string) {
  const sb = supa();
  // verify first so a wrong password does not delete files
  if (!unwrap(await sb.rpc("ak_verify", { p_password: password }))) throw new Error("bad_credentials");
  for (;;) {
    const list = await listMessages("all");
    if (!list.length) break;
    await sb.storage.from(BUCKET_V2).remove(list.map((m) => m.path));
    for (const m of list) unwrap(await sb.rpc("ak_delete", { p_id: m.id }));
    if (list.length < 200) break;
  }
  const r = unwrap(await sb.rpc("ak_delete_account", { p_password: password })) as string;
  if (r !== "ok") throw new Error(r);
  cache.clear();
  set({ status: "out" });
}

/* ------------------------------------------------------------------ messages */
function rid(n = 16) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const r = new Uint8Array(n);
  crypto.getRandomValues(r);
  let s = "";
  for (let i = 0; i < n; i++) s += abc[r[i] % abc.length];
  return s;
}

export async function numberExists(number: string): Promise<boolean> {
  return !!unwrap(await supa().rpc("ak_exists", { p_number: number }));
}

export async function sendFile(to: string, bytes: Uint8Array, kind: "image" | "video", meta: Record<string, unknown>) {
  const a = state;
  if (a.status !== "in") throw new Error("not_logged_in");
  const sb = supa();
  const path = `${a.me}/${rid()}.${kind === "image" ? "ak" : "akv"}`;
  const body = bytes.slice().buffer;
  const up = await sb.storage.from(BUCKET_V2).upload(path, body, { contentType: "application/octet-stream", upsert: false });
  if (up.error) throw up.error;
  const r = await sb.rpc("ak_send", { p_to: to, p_path: path, p_kind: kind, p_meta: meta });
  if (r.error) {
    await sb.storage.from(BUCKET_V2).remove([path]).catch(() => {});
    throw r.error;
  }
  cache.set(path, bytes);
  rememberNumber(to);
  return r.data as string;
}

export async function listMessages(box: "in" | "out" | "all" = "all", before?: string): Promise<Msg[]> {
  return (unwrap(await supa().rpc("ak_list", { p_box: box, p_before: before ?? null, p_limit: 200 })) as Msg[]) || [];
}

const cache = new Map<string, Uint8Array>();
export async function fetchFile(path: string): Promise<Uint8Array> {
  const hit = cache.get(path);
  if (hit) return hit;
  const r = await supa().storage.from(BUCKET_V2).download(path);
  if (r.error) throw r.error;
  const b = new Uint8Array(await r.data.arrayBuffer());
  cache.set(path, b);
  return b;
}

export async function markRead(id: string) {
  await supa().rpc("ak_mark_read", { p_id: id });
}

export async function deleteMessage(m: Msg) {
  const sb = supa();
  await sb.storage.from(BUCKET_V2).remove([m.path]);
  unwrap(await sb.rpc("ak_delete", { p_id: m.id }));
  cache.delete(m.path);
}

export async function block(number: string) {
  unwrap(await supa().rpc("ak_block", { p_number: number }));
}
export async function unblock(number: string) {
  unwrap(await supa().rpc("ak_unblock", { p_number: number }));
}
export async function blocks(): Promise<string[]> {
  return (unwrap(await supa().rpc("ak_blocks")) as string[]) || [];
}

/* ------------------------------------------------------------------ recent numbers (this device only) */
const RECENT = "ak.recent";
export function recentNumbers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "[]");
  } catch {
    return [];
  }
}
export function rememberNumber(n: string) {
  try {
    localStorage.setItem(RECENT, JSON.stringify([n, ...recentNumbers().filter((x) => x !== n)].slice(0, 8)));
  } catch {}
}
