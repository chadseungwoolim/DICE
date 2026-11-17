// Geometry of the SHELFWORLD library. Pure functions, shared by the 3D view and the tests.
//
// Ten shelf rows, one per KDC main class (000 nearest the entrance, 900 at the back).
// Each row holds ten shelf units, one per division (x00 .. x90), split by a central corridor.
// A book's place is computed from its call number, so every catalogued book has a fixed spot.

export const UNIT_W = 2.6; // width of one shelf unit
export const CORRIDOR = 3.2; // central corridor between unit 4 and unit 5
export const ROW_GAP = 5; // distance between shelf rows
export const SHELF_D = 0.6; // shelf depth
export const SHELF_H = 2.75;
export const TIERS = 5;
export const COLS = 16; // spine positions per tier
export const TIER_H = 0.52;
export const BASE_Y = 0.12;
export const HALF_X = 5 * UNIT_W + CORRIDOR / 2; // half length of a row (14.6)
export const START = { x: 0, z: 28 };
export const BOUNDS = { minX: -17.5, maxX: 17.5, minZ: -27, maxZ: 30.5 };

export function rowZ(cls: number): number {
  return 22 - cls * ROW_GAP;
}
/** centre x of division unit (0..9 inside its row) */
export function unitX(d: number): number {
  const left = -HALF_X + UNIT_W / 2;
  return left + d * UNIT_W + (d >= 5 ? CORRIDOR : 0);
}
export function unitCenter(div: number): { x: number; z: number } {
  return { x: unitX(div % 10), z: rowZ(Math.floor(div / 10)) };
}

export interface Place {
  div: number; // 0..99
  col: number; // 0..COLS-1
  tier: number; // 0..TIERS-1 (0 = bottom)
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Place from a KDC class number ("813.7", "909", "004.73").
 * division = first two digits; position along the unit = third digit + decimals (0..10);
 * tier = stable hash of the book id so books sharing a number spread over the tiers.
 * Returns null when the class number is not a KDC number.
 */
export function placeOf(classNo: string | undefined | null, id: string, kdc?: string | null): Place | null {
  const c = (classNo || "").trim();
  let m = c.match(/^(\d)(\d)(\d)?(\.\d+)?/);
  if (!m && kdc && /^\d$/.test(kdc)) m = [kdc + "00", kdc, "0", "0", undefined] as unknown as RegExpMatchArray;
  if (!m) return null;
  const div = Number(m[1]) * 10 + Number(m[2]);
  const within = Number(m[3] ?? 0) + (m[4] ? Math.min(0.999, Number("0" + m[4])) : 0); // 0 .. 9.999
  const col = Math.min(COLS - 1, Math.floor((within / 10) * COLS));
  const tier = hash(id || c) % TIERS;
  return { div, col, tier };
}

/** world position of the spine in a place (front face of the shelf) */
export function spinePosition(p: Place): { x: number; y: number; z: number } {
  const u = unitCenter(p.div);
  const colW = (UNIT_W - 0.16) / COLS;
  return {
    x: u.x - UNIT_W / 2 + 0.08 + colW * (p.col + 0.5),
    y: BASE_Y + p.tier * TIER_H + 0.22,
    z: u.z + 0.05,
  };
}
/** the LED strip segment under a spine (on the front edge of its board) */
export function ledPosition(p: Place): { x: number; y: number; z: number } {
  const s = spinePosition(p);
  return { x: s.x, y: BASE_Y + p.tier * TIER_H - 0.005, z: s.z + SHELF_D / 2 + 0.02 };
}

/** true when (x, z) is inside a shelf or outside the room */
export function blocked(x: number, z: number, r = 0.32): boolean {
  if (x < BOUNDS.minX + r || x > BOUNDS.maxX - r || z < BOUNDS.minZ + r || z > BOUNDS.maxZ - r) return true;
  for (let cls = 0; cls < 10; cls++) {
    const rz = rowZ(cls);
    if (Math.abs(z - rz) < SHELF_D / 2 + r) {
      const ax = Math.abs(x);
      if (ax < HALF_X + r && ax > CORRIDOR / 2 - r) return true;
    }
  }
  return false;
}

/** division the walker is facing: standing in front (south side) of a unit, within reach */
export function facingUnit(x: number, z: number): number | null {
  for (let cls = 0; cls < 10; cls++) {
    const dz = z - (rowZ(cls) + SHELF_D / 2);
    if (dz < 0 || dz > 1.9) continue;
    for (let d = 0; d < 10; d++) {
      if (Math.abs(x - unitX(d)) <= UNIT_W / 2) return cls * 10 + d;
    }
  }
  return null;
}

/** a free standing spot in front of a unit, facing it */
export function standSpot(div: number): { x: number; z: number } {
  const u = unitCenter(div);
  return { x: u.x, z: u.z + SHELF_D / 2 + 1.1 };
}

/** LED blink: 0.7 s on, 0.7 s off */
export function lightOn(ms: number, reduced = false): boolean {
  return reduced || ms % 1400 < 700;
}
