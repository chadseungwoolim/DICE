// Runs a recommendation: parse → National Library searches (in parallel) → rank. Server side only.
import { nlSearch, type Book } from "./nl";
import { describe, parseIntent, planQueries, rank, type Rec } from "./recommend";

export interface RecommendResult { understood: string[]; searches: number; candidates: number; items: Rec[] }

export async function recommendBooks(key: string, text: string, base?: string): Promise<RecommendResult> {
  const intent = parseIntent(text);
  const plan = planQueries(intent);
  const lists = await Promise.all(
    plan.map((q) =>
      nlSearch({ key, kwd: q.kwd, target: q.target, page: q.page, size: q.size, base })
        .then((r) => (q.target === "cheonggu" ? r.items.filter((b) => b.classNo.startsWith(q.kwd)) : r.items))
        .catch(() => [] as Book[])
    )
  );
  const seen = new Set<string>();
  const books: Book[] = [];
  for (const b of lists.flat()) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    books.push(b);
  }
  return { understood: describe(intent), searches: plan.length, candidates: books.length, items: rank(intent, books, 12) };
}
