// National Library of Korea (국립중앙도서관) Open API: 소장자료 검색 (search.do). Server side only:
// the certification key comes from the NL_API_KEY environment variable and never reaches the browser.

export interface Book {
  id: string;
  title: string;
  author: string;
  publisher: string;
  year: string;
  isbn: string;
  classNo: string; // KDC class number, e.g. 813.7
  callNo: string; // call number at the National Library, e.g. 813.7-25-1813
  kdc: string; // main class digit
  place: string; // where the copy is kept at the National Library
  image: string;
  link: string;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
export function clean(s: unknown): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (ENT[e]) return ENT[e];
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function toBook(r: Record<string, unknown>): Book {
  const img = clean(r.imageUrl);
  const link = clean(r.detailLink);
  return {
    id: clean(r.id) || clean(r.controlNo),
    title: clean(r.titleInfo),
    author: clean(r.authorInfo),
    publisher: clean(r.pubInfo),
    year: clean(r.pubYearInfo),
    isbn: clean(r.isbn),
    classNo: clean(r.classNo),
    callNo: clean(r.callNo),
    kdc: clean(r.kdcCode1s),
    place: clean(r.placeInfo),
    image: img ? (/^https?:\/\//.test(img) ? img : `https://cover.nl.go.kr/${img.replace(/^\/+/, "")}`) : "",
    link: link ? (/^https?:\/\//.test(link) ? link : `https://www.nl.go.kr${link}`) : "",
  };
}

export const TARGETS = ["total", "title", "author", "publisher", "cheonggu"] as const;
export type Target = (typeof TARGETS)[number];

export async function nlSearch(opts: {
  key: string;
  kwd: string;
  target: Target;
  page: number;
  size: number;
  sort?: string;
  order?: "asc" | "desc";
  base?: string;
}): Promise<{ total: number; items: Book[] }> {
  const p = new URLSearchParams({
    key: opts.key,
    apiType: "json",
    srchTarget: opts.target,
    kwd: opts.kwd,
    pageNum: String(opts.page),
    pageSize: String(opts.size),
    category: "도서",
  });
  if (opts.sort) p.set("sort", opts.sort);
  if (opts.order) p.set("order", opts.order);
  const base = (opts.base || "https://www.nl.go.kr").replace(/\/+$/, "");
  const res = await fetch(`${base}/NL/search/openApi/search.do?${p}`, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`국립중앙도서관 응답 ${res.status}`);
  const text = await res.text();
  let data: { total?: number | string; result?: Record<string, unknown>[]; error?: unknown; errorMessage?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("국립중앙도서관 응답을 읽지 못했습니다");
  }
  if (!Array.isArray(data.result)) {
    if (data.error || data.errorMessage) throw new Error(`국립중앙도서관 오류: ${clean(data.errorMessage || data.error)}`);
    return { total: Number(data.total) || 0, items: [] };
  }
  return { total: Number(data.total) || 0, items: data.result.map(toBook).filter((b) => b.id && b.title) };
}

/** Books of one KDC division (e.g. "81"): ten call-number searches (810 .. 819), kept only when the class number really starts there. */
export async function nlDivision(key: string, div: string, base?: string): Promise<Book[]> {
  const parts = await Promise.all(
    Array.from({ length: 10 }, (_, d) =>
      nlSearch({ key, kwd: div + d, target: "cheonggu", page: 1, size: 40, sort: "ipub_year", order: "desc", base })
        .then((r) => r.items.filter((b) => b.classNo.startsWith(div + d)))
        .catch(() => [] as Book[])
    )
  );
  const seen = new Set<string>();
  const out: Book[] = [];
  for (const b of parts.flat()) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
  }
  out.sort((a, b) => (parseFloat(a.classNo) || 0) - (parseFloat(b.classNo) || 0) || a.title.localeCompare(b.title, "ko"));
  return out.slice(0, 240);
}
