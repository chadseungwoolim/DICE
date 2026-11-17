import { nlDivision, nlSearch, TARGETS, type Target } from "@/lib/shelfworld/nl";
import { recommendBooks } from "@/lib/shelfworld/recommendServer";

// Seoul region: the National Library API answers fastest (and most reliably) from Korea.
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

function json(body: unknown, status = 200, cache = false) {
  return Response.json(body, {
    status,
    headers: {
      ...CORS,
      "Cache-Control": cache ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store",
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/nl?type=search&q=코스모스&target=total&page=1  → { total, page, items }
 * GET /api/nl?type=shelf&div=81                          → { div, items }
 */
export async function GET(req: Request) {
  // Owner chose to keep the key in the code (public repo) so the site works without setting an env var.
  const key = process.env.NL_API_KEY || "127fade30508a1893a922bb18c56cad86532e95b65a36336e6a2493a6a85aea7";
  if (!key) return json({ error: "서버에 국립중앙도서관 인증키(NL_API_KEY)가 설정되지 않았습니다." }, 503);
  const base = process.env.NL_API_BASE; // tests only
  const u = new URL(req.url);
  const type = u.searchParams.get("type") || "search";
  try {
    if (type === "shelf") {
      const div = u.searchParams.get("div") || "";
      if (!/^\d{2}$/.test(div)) return json({ error: "div는 두 자리 숫자여야 합니다." }, 400);
      const items = await nlDivision(key, div, base);
      return json({ div, items }, 200, true);
    }
    if (type === "recommend") {
      const text = (u.searchParams.get("q") || "").trim().slice(0, 200);
      if (!text) return json({ error: "어떤 책을 원하는지 적어 주세요." }, 400);
      return json(await recommendBooks(key, text, base), 200, true);
    }
    const q = (u.searchParams.get("q") || "").trim().slice(0, 100);
    if (!q) return json({ error: "검색어를 입력하세요." }, 400);
    const t = u.searchParams.get("target") || "total";
    const target: Target = (TARGETS as readonly string[]).includes(t) ? (t as Target) : "total";
    const page = Math.min(100, Math.max(1, parseInt(u.searchParams.get("page") || "1", 10) || 1));
    const r = await nlSearch({ key, kwd: q, target, page, size: 30, base });
    return json({ total: r.total, page, items: r.items }, 200, true);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "국립중앙도서관 검색에 실패했습니다." }, 502);
  }
}
