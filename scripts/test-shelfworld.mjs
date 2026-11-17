// SHELFWORLD checks: library geometry (every place reachable, no overlaps) and the National Library API adapter.
// Run: npm run test:shelfworld   (needs Node 22.18+ for TypeScript type stripping)
// The API test talks to a replay server when NL_TEST_BASE is set (e.g. http://localhost:4199) and is skipped otherwise.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../lib/shelfworld/layout.ts";
import { DIVISIONS, CLASSES, divisionCode } from "../lib/shelfworld/kdc.ts";
import { clean, toBook, nlSearch, nlDivision } from "../lib/shelfworld/nl.ts";

test("KDC table has 10 classes x 10 divisions", () => {
  assert.equal(CLASSES.length, 10);
  assert.ok(DIVISIONS.every((d) => d.length === 10));
  assert.equal(divisionCode(81), "810");
  assert.equal(divisionCode(0), "000");
});

test("call numbers map to the right division, column and tier", () => {
  assert.deepEqual(L.placeOf("813.7", "a").div, 81);
  assert.equal(L.placeOf("813.7", "a").col, Math.floor((3.7 / 10) * L.COLS));
  assert.equal(L.placeOf("004.73", "b").div, 0);
  assert.equal(L.placeOf("909", "c").div, 90);
  assert.equal(L.placeOf("", "d", "4").div, 40);
  assert.equal(L.placeOf("", "e", "Z"), null);
  assert.equal(L.placeOf("CD 123", "f"), null);
  const t = L.placeOf("813.7", "same-id").tier;
  assert.equal(L.placeOf("813.7", "same-id").tier, t, "stable");
  for (let i = 0; i < 2000; i++) {
    const p = L.placeOf(`${String(i % 1000).padStart(3, "0")}.${i}`, "id" + i);
    assert.ok(p.div >= 0 && p.div < 100 && p.col >= 0 && p.col < L.COLS && p.tier >= 0 && p.tier < L.TIERS);
  }
});

test("all 8,000 spine places are distinct and sit on their own unit", () => {
  const seen = new Set();
  for (let div = 0; div < 100; div++)
    for (let tier = 0; tier < L.TIERS; tier++)
      for (let col = 0; col < L.COLS; col++) {
        const s = L.spinePosition({ div, tier, col });
        const u = L.unitCenter(div);
        assert.ok(Math.abs(s.x - u.x) < L.UNIT_W / 2);
        assert.ok(s.y > 0 && s.y < L.SHELF_H);
        seen.add(`${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)}`);
      }
  assert.equal(seen.size, 100 * L.TIERS * L.COLS);
});

test("start is free and every unit can be reached and faced from the entrance", () => {
  assert.equal(L.blocked(L.START.x, L.START.z), false);
  const step = 0.25, key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const q = [[L.START.x, L.START.z]], seen = new Set([key(L.START.x, L.START.z)]);
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (!seen.has(k) && !L.blocked(nx, nz)) { seen.add(k); q.push([nx, nz]); }
    }
  }
  for (let div = 0; div < 100; div++) {
    const s = L.standSpot(div);
    assert.ok(seen.has(key(s.x, s.z)), `unit ${div} unreachable`);
    assert.equal(L.facingUnit(s.x, s.z), div);
  }
  // shelves themselves are solid
  for (let div = 0; div < 100; div++) { const u = L.unitCenter(div); assert.ok(L.blocked(u.x, u.z)); }
});

test("LED blinks 0.7 s on / 0.7 s off; reduced motion stays lit", () => {
  for (const [ms, on] of [[0, true], [699, true], [700, false], [1399, false], [1400, true]]) assert.equal(L.lightOn(ms), on);
  assert.equal(L.lightOn(700, true), true);
});

test("API records are cleaned and covers get absolute URLs", () => {
  assert.equal(clean('<span class="searching_txt">코스모스</span> &amp; 별'), "코스모스 & 별");
  const b = toBook({ id: "1", titleInfo: "<b>A</b>", authorInfo: "x", imageUrl: "kolis/2023/a.jpg", detailLink: "/NL/contents/search.do#viewKey=1", classNo: "813.7" });
  assert.equal(b.title, "A");
  assert.equal(b.image, "https://cover.nl.go.kr/kolis/2023/a.jpg");
  assert.equal(b.link, "https://www.nl.go.kr/NL/contents/search.do#viewKey=1");
});

const base = process.env.NL_TEST_BASE;
test("search and division browse against recorded API responses", { skip: !base }, async () => {
  const r = await nlSearch({ key: "test", kwd: "코스모스", target: "total", page: 1, size: 30, base });
  assert.ok(r.total > 100 && r.items.length === 30);
  assert.ok(r.items.every((b) => !/[<>]/.test(b.title)));
  const d = await nlDivision("test", "81", base);
  assert.ok(d.length > 50, `got ${d.length}`);
  assert.ok(d.every((b) => b.classNo.startsWith("81")));
  assert.equal(new Set(d.map((b) => b.id)).size, d.length);
  for (let i = 1; i < d.length; i++) assert.ok(parseFloat(d[i - 1].classNo) <= parseFloat(d[i].classNo));
});
