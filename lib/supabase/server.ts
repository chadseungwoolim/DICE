import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function supabaseServer() {
  const cookieStore = cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        // Next 쿠키 타입이 버전에 따라 달라서 안전 캐스팅
        const store = cookieStore as unknown as { getAll: () => Array<{ name: string; value: string }> };
        return store.getAll();
      },
      setAll(cookiesToSet) {
        // Server Component 환경에선 set이 막혀 있을 수 있음 → 가능한 경우에만 set
        const store = cookieStore as unknown as {
          set?: (name: string, value: string, options?: any) => void;
        };

        if (!store.set) return;

        cookiesToSet.forEach((cookie) => {
          store.set?.(cookie.name, cookie.value, cookie.options);
        });
      },
    },
  });
}