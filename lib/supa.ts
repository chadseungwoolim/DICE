"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let client: SupabaseClient | null = null;

export const supaReady = () => !!URL_ && !!KEY;

/** One client per page. The session is an anonymous Supabase user that stands for this device. */
export function supa(): SupabaseClient {
  if (!client) {
    client = createClient(URL_, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "ak.auth", detectSessionInUrl: false },
    });
  }
  return client;
}

export const BUCKET_V2 = "ak";
