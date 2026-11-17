// SHELFWORLD 3D view (browser only). Monochrome architectural-model look in the Aₖ palette:
// white volumes, thin dark edges, grey spines, and the signal colour only for the book being located.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CLASSES, divisionCode, divisionName } from "./kdc";
import {
  BASE_Y, BOUNDS, COLS, CORRIDOR, HALF_X, SHELF_D, SHELF_H, START, TIER_H, TIERS, UNIT_W,
  blocked, facingUnit, ledPosition, lightOn, rowZ, spinePosition, standSpot, unitCenter, type Place,
} from "./layout";

export type ViewMode = "walk" | "plan";
export interface WorldEvents {
  onFacing?: (div: number | null) => void;
  onInteract?: () => void;
}
export interface World {
  locate(p: Place): void;
  clear(): void;
  goTo(div: number): void;
  setView(v: ViewMode): void;
  press(key: string, down: boolean): void;
  dispose(): void;
}

interface Palette { bg: string; fg: string; mid: string; dim: string; line: string; faint: string; signal: string }
function palette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d;
  return {
    bg: v("--bg", "#ffffff"), fg: v("--fg", "#0b0b0b"), mid: v("--mid", "#6e6e6e"), dim: v("--dim", "#a3a3a3"),
    line: v("--line", "#d6d6d6"), faint: v("--faint", "#f3f3f3"), signal: v("--signal", "#e2350d"),
  };
}
function mono(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
}
function sans(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--sans").trim() || "sans-serif";
}

/** Text plane drawn on a canvas (labels on top of the shelves). */
function label(lines: { text: string; font: string; color: string }[], w: number, h: number, worldW: number) {
  const scale = 4;
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  g.textBaseline = "middle";
  const step = h / (lines.length + 1);
  lines.forEach((l, i) => {
    g.font = l.font;
    g.fillStyle = l.color;
    g.fillText(l.text, 8, step * (i + 1));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(worldW, (worldW * h) / w), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  return m;
}

export function createWorld(host: HTMLElement, minimap: HTMLCanvasElement | null, ev: WorldEvents = {}): World {
  let pal = palette();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xbdbdbd, 2.2);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-8, 20, 14);
  scene.add(hemi, sun);

  // ---------- materials (recoloured on theme change) ----------
  const mFloor = keep(new THREE.MeshLambertMaterial());
  const mSolid = keep(new THREE.MeshLambertMaterial());
  const mEdge = keep(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }));
  const mGrid = keep(new THREE.LineBasicMaterial({ transparent: true, opacity: 1 }));
  const mStrip = keep(new THREE.MeshBasicMaterial());
  const mWalker = keep(new THREE.MeshLambertMaterial());
  const mSignal = keep(new THREE.MeshBasicMaterial());
  const mBeam = keep(new THREE.LineBasicMaterial());
  const mSpine = keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));

  // ---------- floor ----------
  const fw = BOUNDS.maxX - BOUNDS.minX, fd = BOUNDS.maxZ - BOUNDS.minZ;
  const floor = new THREE.Mesh(keep(new THREE.BoxGeometry(fw, 0.2, fd)), mFloor);
  floor.position.set((BOUNDS.maxX + BOUNDS.minX) / 2, -0.1, (BOUNDS.maxZ + BOUNDS.minZ) / 2);
  scene.add(floor);
  const gridPts: number[] = [];
  for (let x = Math.ceil(BOUNDS.minX); x <= BOUNDS.maxX; x++) gridPts.push(x, 0.002, BOUNDS.minZ, x, 0.002, BOUNDS.maxZ);
  for (let z = Math.ceil(BOUNDS.minZ); z <= BOUNDS.maxZ; z++) gridPts.push(BOUNDS.minX, 0.002, z, BOUNDS.maxX, 0.002, z);
  const gridGeo = keep(new THREE.BufferGeometry());
  gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
  scene.add(new THREE.LineSegments(gridGeo, mGrid));
  const floorEdge = new THREE.LineSegments(keep(new THREE.EdgesGeometry(floor.geometry)), mEdge);
  floorEdge.position.copy(floor.position);
  scene.add(floorEdge);
  // entrance mark
  const door = new THREE.Mesh(keep(new THREE.BoxGeometry(CORRIDOR, 0.01, 0.06)), mStrip);
  door.position.set(0, 0.01, BOUNDS.maxZ - 0.03);
  scene.add(door);

  // ---------- shelves (one merged mesh + one merged edge set) ----------
  const parts: THREE.BufferGeometry[] = [];
  const strips: THREE.BufferGeometry[] = [];
  const t = 0.04;
  const put = (list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    list.push(g);
  };
  for (let div = 0; div < 100; div++) {
    const u = unitCenter(div);
    put(parts, UNIT_W, SHELF_H, t, u.x, SHELF_H / 2, u.z - SHELF_D / 2 + t / 2); // back
    put(parts, t, SHELF_H, SHELF_D, u.x - UNIT_W / 2 + t / 2, SHELF_H / 2, u.z); // sides
    put(parts, t, SHELF_H, SHELF_D, u.x + UNIT_W / 2 - t / 2, SHELF_H / 2, u.z);
    for (let k = 0; k <= TIERS; k++) {
      const y = BASE_Y + k * TIER_H;
      put(parts, UNIT_W, 0.03, SHELF_D, u.x, y, u.z); // boards
      if (k < TIERS) put(strips, UNIT_W - 0.1, 0.012, 0.01, u.x, y + 0.006, u.z + SHELF_D / 2 + 0.006); // LED strip line
    }
    put(parts, UNIT_W, 0.06, SHELF_D + 0.04, u.x, SHELF_H, u.z); // top
  }
  const shelfGeo = keep(mergeGeometries(parts));
  parts.forEach((g) => g.dispose());
  scene.add(new THREE.Mesh(shelfGeo, mSolid));
  scene.add(new THREE.LineSegments(keep(new THREE.EdgesGeometry(shelfGeo, 30)), mEdge));
  const stripGeo = keep(mergeGeometries(strips));
  strips.forEach((g) => g.dispose());
  scene.add(new THREE.Mesh(stripGeo, mStrip));

  // ---------- spines: one instanced mesh, grey tones ----------
  const per = TIERS * COLS;
  const spines = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), mSpine, 100 * per);
  const colW = (UNIT_W - 0.16) / COLS;
  const shade: number[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dummy = new THREE.Object3D();
  for (let div = 0; div < 100; div++) {
    for (let tier = 0; tier < TIERS; tier++) {
      for (let col = 0; col < COLS; col++) {
        const i = div * per + tier * COLS + col;
        const p = spinePosition({ div, tier, col });
        const h = 0.3 + rnd() * 0.15, d = 0.34 + rnd() * 0.12;
        dummy.position.set(p.x, BASE_Y + tier * TIER_H + 0.015 + h / 2, unitCenter(div).z + SHELF_D / 2 - d / 2 - 0.02);
        dummy.scale.set(colW * (0.72 + rnd() * 0.2), h, d);
        dummy.updateMatrix();
        spines.setMatrixAt(i, dummy.matrix);
        shade.push(rnd());
      }
    }
  }
  scene.add(spines);
  disposables.push(spines);

  // ---------- labels ----------
  const labels: THREE.Mesh[] = [];
  function buildLabels() {
    for (const l of labels) {
      scene.remove(l);
      (l.material as THREE.MeshBasicMaterial).map?.dispose();
      (l.material as THREE.Material).dispose();
      l.geometry.dispose();
    }
    labels.length = 0;
    const mf = mono(), sf = sans();
    for (let div = 0; div < 100; div++) {
      const u = unitCenter(div);
      const m = label(
        [
          { text: divisionCode(div), font: `400 15px ${mf}`, color: pal.fg },
          { text: divisionName(div), font: `300 11px ${sf}`, color: pal.mid },
        ],
        150, 46, 1.35
      );
      m.position.set(u.x - UNIT_W / 2 + 0.72, SHELF_H + 0.27, u.z + SHELF_D / 2);
      scene.add(m);
      labels.push(m);
    }
    for (let cls = 0; cls < 10; cls++) {
      const m = label(
        [
          { text: `${cls}00 ${CLASSES[cls]}`, font: `300 22px ${sf}`, color: pal.fg },
          { text: `${cls}00–${cls}99`, font: `400 12px ${mf}`, color: pal.mid },
        ],
        210, 62, 2.1
      );
      m.position.set(0.15, SHELF_H + 0.15, rowZ(cls) + SHELF_D / 2);
      scene.add(m);
      labels.push(m);
    }
  }

  // ---------- walker ----------
  const walker = new THREE.Group();
  const limbGeo = keep(new THREE.BoxGeometry(0.15, 0.62, 0.17));
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(0.46, 0.66, 0.26)), mWalker);
  body.position.y = 1.0;
  const head = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.3, 0.3)), mWalker);
  head.position.y = 1.55;
  const legs = [-0.11, 0.11].map((x) => {
    const g = new THREE.Group();
    g.position.set(x, 0.67, 0);
    const m = new THREE.Mesh(limbGeo, mWalker);
    m.position.y = -0.31;
    g.add(m);
    return g;
  });
  const arms = [-0.31, 0.31].map((x) => {
    const g = new THREE.Group();
    g.position.set(x, 1.3, 0);
    const m = new THREE.Mesh(limbGeo, mWalker);
    m.position.y = -0.29;
    m.scale.set(0.8, 0.9, 0.8);
    g.add(m);
    return g;
  });
  walker.add(body, head, ...legs, ...arms);
  walker.position.set(START.x, 0, START.z);
  scene.add(walker);

  // ---------- locate marker ----------
  const led = new THREE.Mesh(keep(new THREE.BoxGeometry(colW * 1.05, 0.03, 0.03)), mSignal);
  const halo = new THREE.Mesh(keep(new THREE.BoxGeometry(1, 1, 1)), mSignal);
  const beamGeo = keep(new THREE.BufferGeometry());
  beamGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 7, 0], 3));
  const beam = new THREE.Line(beamGeo, mBeam);
  const ringPts: number[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ringPts.push(Math.cos(a) * 0.55, 0.01, Math.sin(a) * 0.55);
  }
  const ringGeo = keep(new THREE.BufferGeometry());
  ringGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringPts, 3));
  const ring = new THREE.Line(ringGeo, mBeam);
  const marker = new THREE.Group();
  marker.add(led, halo, beam, ring);
  marker.visible = false;
  scene.add(marker);
  let target: Place | null = null;
  let targetIndex = -1;
  let signalStart = 0;

  // ---------- colours ----------
  function applyPalette() {
    pal = palette();
    scene.background = new THREE.Color(pal.bg);
    scene.fog = new THREE.Fog(pal.bg, 34, 95);
    mFloor.color.set(pal.faint);
    mSolid.color.set(pal.bg);
    mEdge.color.set(pal.fg);
    mEdge.opacity = 0.75;
    mGrid.color.set(pal.line);
    mStrip.color.set(pal.dim);
    mWalker.color.set(pal.fg);
    mSignal.color.set(pal.signal);
    mBeam.color.set(pal.signal);
    const a = new THREE.Color(pal.mid), b = new THREE.Color(pal.line), c = new THREE.Color();
    for (let i = 0; i < spines.count; i++) {
      c.copy(a).lerp(b, shade[i]);
      spines.setColorAt(i, c);
    }
    if (targetIndex >= 0) spines.setColorAt(targetIndex, new THREE.Color(pal.signal));
    if (spines.instanceColor) spines.instanceColor.needsUpdate = true;
    buildLabels();
  }
  applyPalette();
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => applyPalette();
  scheme.addEventListener("change", onScheme);

  // ---------- input ----------
  const keys = new Set<string>();
  const keyName = (k: string) =>
    ({ ArrowUp: "w", ArrowDown: "s", ArrowLeft: "a", ArrowRight: "d", Shift: "shift" } as Record<string, string>)[k] || k.toLowerCase();
  const typing = (e: Event) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
  };
  const onDown = (e: KeyboardEvent) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = keyName(e.key);
    if (["w", "a", "s", "d", "shift"].includes(k)) {
      keys.add(k);
      if (k !== "shift") e.preventDefault();
    } else if (k === "e" && !e.repeat) ev.onInteract?.();
  };
  const onUp = (e: KeyboardEvent) => keys.delete(keyName(e.key));
  const clearKeys = () => keys.clear();
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", clearKeys);

  let theta = 0, dist = 9, drag = false, lastX = 0, lastY = 0, pitch = 0.62;
  const cv = renderer.domElement;
  const pd = (e: PointerEvent) => {
    drag = true;
    lastX = e.clientX;
    lastY = e.clientY;
    cv.setPointerCapture(e.pointerId);
  };
  const pm = (e: PointerEvent) => {
    if (!drag) return;
    theta -= (e.clientX - lastX) * 0.006;
    pitch = Math.min(1.25, Math.max(0.25, pitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const pu = () => (drag = false);
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    dist = Math.min(20, Math.max(4, dist * (1 + Math.sign(e.deltaY) * 0.1)));
  };
  cv.addEventListener("pointerdown", pd);
  cv.addEventListener("pointermove", pm);
  cv.addEventListener("pointerup", pu);
  cv.addEventListener("pointercancel", pu);
  cv.addEventListener("wheel", wheel, { passive: false });

  // ---------- size ----------
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  ro.observe(host);

  // ---------- minimap ----------
  const mm = minimap?.getContext("2d") || null;
  function drawMap() {
    if (!mm || !minimap) return;
    const W = minimap.width, H = minimap.height;
    const sx = W / (BOUNDS.maxX - BOUNDS.minX), sz = H / (BOUNDS.maxZ - BOUNDS.minZ);
    const X = (x: number) => (x - BOUNDS.minX) * sx, Z = (z: number) => (z - BOUNDS.minZ) * sz;
    mm.fillStyle = pal.bg;
    mm.fillRect(0, 0, W, H);
    mm.strokeStyle = pal.line;
    mm.strokeRect(0.5, 0.5, W - 1, H - 1);
    mm.fillStyle = pal.dim;
    for (let cls = 0; cls < 10; cls++) {
      const z = Z(rowZ(cls) - SHELF_D / 2);
      mm.fillRect(X(-HALF_X), z, X(-CORRIDOR / 2) - X(-HALF_X), Math.max(1.5, SHELF_D * sz));
      mm.fillRect(X(CORRIDOR / 2), z, X(HALF_X) - X(CORRIDOR / 2), Math.max(1.5, SHELF_D * sz));
    }
    if (target) {
      const u = unitCenter(target.div);
      mm.fillStyle = pal.signal;
      mm.fillRect(X(u.x - UNIT_W / 2), Z(u.z) - 3, UNIT_W * sx, 6);
    }
    mm.fillStyle = pal.fg;
    mm.save();
    mm.translate(X(walker.position.x), Z(walker.position.z));
    mm.rotate(-walker.rotation.y);
    mm.beginPath();
    mm.moveTo(0, -5);
    mm.lineTo(3.5, 3.5);
    mm.lineTo(-3.5, 3.5);
    mm.closePath();
    mm.fill();
    mm.restore();
  }

  // ---------- loop ----------
  let view: ViewMode = "walk";
  let facing: number | null = null;
  let raf = 0, last = performance.now(), tick = 0, mapT = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const desired = new THREE.Vector3(), look = new THREE.Vector3(), lookNow = new THREE.Vector3(0, 1, 20);
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    tick += dt;
    let dx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
    let dz = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
    const moving = dx !== 0 || dz !== 0;
    if (moving) {
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      const vx = dx * Math.cos(theta) + dz * Math.sin(theta);
      const vz = -dx * Math.sin(theta) + dz * Math.cos(theta);
      const rate = keys.has("shift") ? 7 : 3.6;
      for (let rest = dt; rest > 1e-6; rest -= 0.04) {
        const s = rate * Math.min(rest, 0.04);
        if (!blocked(walker.position.x + vx * s, walker.position.z)) walker.position.x += vx * s;
        if (!blocked(walker.position.x, walker.position.z + vz * s)) walker.position.z += vz * s;
      }
      walker.rotation.y = Math.atan2(-vx, -vz);
      const sw = Math.sin(tick * (keys.has("shift") ? 14 : 10)) * 0.55;
      legs[0].rotation.x = sw;
      legs[1].rotation.x = -sw;
      arms[0].rotation.x = -sw * 0.8;
      arms[1].rotation.x = sw * 0.8;
    } else {
      for (const l of [...legs, ...arms]) l.rotation.x *= 0.8;
    }
    const p = walker.position;
    if (view === "walk") {
      desired.set(p.x + Math.sin(theta) * dist * Math.cos(pitch), 1.4 + dist * Math.sin(pitch), p.z + Math.cos(theta) * dist * Math.cos(pitch));
      look.set(p.x - Math.sin(theta) * 1.5, 1.2, p.z - Math.cos(theta) * 1.5);
    } else {
      desired.set(0, 58, 26);
      look.set(0, 0, 1);
    }
    const k = 1 - Math.exp(-dt * 5);
    camera.position.lerp(desired, k);
    lookNow.lerp(look, k);
    camera.lookAt(lookNow);

    const f = facingUnit(p.x, p.z);
    if (f !== facing) {
      facing = f;
      ev.onFacing?.(f);
    }
    if (target) {
      const on = lightOn(now - signalStart, reduced.matches);
      led.visible = on;
      halo.visible = on;
      const c = on ? pal.signal : pal.mid;
      spines.setColorAt(targetIndex, new THREE.Color(c));
      if (spines.instanceColor) spines.instanceColor.needsUpdate = true;
    }
    mapT += dt;
    if (mapT > 0.1) {
      mapT = 0;
      drawMap();
    }
    renderer.render(scene, camera);
  }
  camera.position.set(START.x, 1.4 + dist * Math.sin(pitch), START.z + dist * Math.cos(pitch));
  lookNow.set(START.x, 1.2, START.z - 1.5);
  camera.lookAt(lookNow);
  raf = requestAnimationFrame(frame);

  function resetSpine() {
    if (targetIndex < 0) return;
    const a = new THREE.Color(pal.mid), b = new THREE.Color(pal.line);
    spines.setColorAt(targetIndex, a.lerp(b, shade[targetIndex]));
    if (spines.instanceColor) spines.instanceColor.needsUpdate = true;
    targetIndex = -1;
  }

  return {
    locate(pl: Place) {
      resetSpine();
      target = pl;
      targetIndex = pl.div * per + pl.tier * COLS + pl.col;
      const l = ledPosition(pl), s = spinePosition(pl), u = unitCenter(pl.div);
      led.position.set(l.x, l.y + 0.02, l.z);
      halo.scale.set(colW * 1.3, 0.012, 0.012);
      halo.position.set(s.x, BASE_Y + (pl.tier + 1) * TIER_H - 0.02, l.z);
      beam.position.set(s.x, 0, u.z + SHELF_D / 2 + 0.25);
      ring.position.set(s.x, 0, u.z + SHELF_D / 2 + 1.1);
      marker.visible = true;
      signalStart = performance.now();
      drawMap();
    },
    clear() {
      resetSpine();
      target = null;
      marker.visible = false;
      drawMap();
    },
    goTo(div: number) {
      const s = standSpot(div);
      walker.position.set(s.x, 0, s.z);
      walker.rotation.y = 0;
      theta = 0;
      if (view === "plan") view = "walk";
    },
    setView(v: ViewMode) {
      view = v;
    },
    press(key: string, down: boolean) {
      if (down) keys.add(key);
      else keys.delete(key);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scheme.removeEventListener("change", onScheme);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
      for (const l of labels) {
        (l.material as THREE.MeshBasicMaterial).map?.dispose();
        (l.material as THREE.Material).dispose();
        l.geometry.dispose();
      }
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      cv.remove();
    },
  };
}

