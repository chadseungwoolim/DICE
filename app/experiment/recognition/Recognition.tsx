"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Core } from "@/lib/core";
import { fileToBitmap, paint, rasterize, saveBlob } from "@/lib/image";
import { bytes, fixed, pct } from "@/lib/fmt";
import { byLevel, empiricalMin, logisticFit, logit, median, perImage, shuffle, steepest, type LevelStat, type Obs } from "@/lib/psy";
import { CAT_CLASSES, MODEL_MB, classify, loadClassifier } from "@/lib/classifier";
import Chart, { type Marker, type Series } from "@/app/components/Chart";
import FilePick from "@/app/components/FilePick";

type Level = { k: number; size: number; rmse: number; psnr: number; rgba: Uint8ClampedArray };
type Item = { key: string; name: string; control: boolean; w: number; h: number; orig: number; base: Uint8ClampedArray; levels: Level[] };
type Trial = { sig: string; img: string; control: boolean; k: number; size: number; ratio: number; yes: boolean; rt: number; observer: string; t: number };
type AutoRec = { img: string; control: boolean; k: number; size: number; ratio: number; pcat: number; top1: number; top1Label: string; top5: number[] };

const TRIALS_KEY = "ak.e3.trials";
const SIZES = [128, 192, 256, 384];

function loadTrials(): Trial[] {
  try {
    return JSON.parse(localStorage.getItem(TRIALS_KEY) || "[]");
  } catch {
    return [];
  }
}
function storeTrials(t: Trial[]) {
  try {
    localStorage.setItem(TRIALS_KEY, JSON.stringify(t));
  } catch {}
}

export default function Recognition() {
  const core = useRef<Core | null>(null);
  const [targets, setTargets] = useState<File[]>([]);
  const [controls, setControls] = useState<File[]>([]);
  const [ranksText, setRanksText] = useState("1,2,3,4,5,6,8,10,12,16,24,32");
  const [size, setSize] = useState(256);
  const [mono, setMono] = useState(true);
  const [bits, setBits] = useState(5);
  const [items, setItems] = useState<Item[]>([]);
  const [sig, setSig] = useState("");
  const [prep, setPrep] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"human" | "auto" | "results">("human");
  const [trials, setTrials] = useState<Trial[]>([]);
  const [auto, setAuto] = useState<AutoRec[]>([]);
  const [tau, setTau] = useState(0.5);
  const [xAxis, setXAxis] = useState<"bytes" | "ratio">("bytes");
  const [crit, setCrit] = useState<"top1" | "top5" | "p50">("top1");

  useEffect(() => {
    core.current = new Core();
    setTrials(loadTrials());
    return () => core.current?.terminate();
  }, []);

  const ranks = useMemo(
    () =>
      Array.from(new Set(ranksText.split(/[^0-9]+/).map(Number).filter((x) => x >= 1 && x <= 400))).sort((a, b) => a - b),
    [ranksText]
  );

  async function prepare() {
    if (!core.current) return;
    setErr("");
    setAuto([]);
    const all = [...targets.map((f) => ({ f, control: false })), ...controls.map((f) => ({ f, control: true }))];
    const out: Item[] = [];
    try {
      for (let i = 0; i < all.length; i++) {
        const { f, control } = all[i];
        setPrep(`${i + 1}/${all.length} ${f.name}`);
        const r = rasterize((await fileToBitmap(f)) as ImageBitmap, size);
        const key = `${f.name}|${f.size}`;
        const buf = r.rgba.buffer.slice(0) as ArrayBuffer;
        await core.current.call("load", { key, rgba: buf, w: r.w, h: r.h }, [buf]);
        const lv = await core.current.call<{ k: number; size: number; rmse: number; psnr: number; rgba: Uint8ClampedArray }[]>("sweep", {
          key,
          ranks,
          bits,
          mono,
        });
        await core.current.call("drop", { key });
        out.push({
          key,
          name: f.name,
          control,
          w: r.w,
          h: r.h,
          orig: f.size,
          base: r.rgba,
          levels: lv.map((l) => ({ k: l.k, size: l.size, rmse: l.rmse, psnr: l.psnr, rgba: l.rgba })),
        });
      }
      setItems(out);
      setSig(`${size}|${mono ? "mono" : "color"}|${bits}b`);
      setPrep("");
    } catch (e) {
      setErr((e as Error).message);
      setPrep("");
    }
  }

  const addTrials = useCallback((t: Trial[]) => {
    setTrials((old) => {
      const v = [...old, ...t];
      storeTrials(v);
      return v;
    });
  }, []);

  /* ---------------- analysis ---------------- */
  const keys = useMemo(() => new Set(items.map((i) => i.key)), [items]);
  const humanObs: Obs[] = useMemo(
    () => trials.filter((t) => t.sig === sig && keys.has(t.img)).map((t) => ({ img: t.img, k: t.k, size: t.size, ratio: t.ratio, yes: t.yes, control: t.control })),
    [trials, sig, keys]
  );
  const autoObs: Obs[] = useMemo(
    () =>
      auto
        .filter((a) => a.k > 0)
        .map((a) => ({
          img: a.img,
          k: a.k,
          size: a.size,
          ratio: a.ratio,
          control: a.control,
          yes: crit === "top1" ? CAT_CLASSES.includes(a.top1) : crit === "top5" ? a.top5.some((c) => CAT_CLASSES.includes(c)) : a.pcat > 0.5,
        })),
    [auto, crit]
  );
  const sizeOf = useCallback(
    (k: number) => {
      const t = items.filter((i) => !i.control).map((i) => i.levels.find((l) => l.k === k)).filter(Boolean) as Level[];
      const tt = items.filter((i) => !i.control && i.levels.some((l) => l.k === k));
      if (!t.length) return { size: NaN, ratio: NaN };
      return {
        size: t.reduce((s, l) => s + l.size, 0) / t.length,
        ratio: tt.reduce((s, it) => s + it.orig / it.levels.find((l) => l.k === k)!.size, 0) / tt.length,
      };
    },
    [items]
  );

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="label mono">E3</div>
          <div className="h1">Size vs recognition</div>
        </div>
        <p className="note" style={{ maxWidth: 560 }}>
          각 이미지를 여러 rank로 실제 .ak 파일로 인코딩하고, 그 파일을 복호화한 영상을 사람 또는 분류 모델이 판정합니다.
          X축은 실제 파일 크기(바이트) 또는 압축비, Y축은 고양이 이미지 중 &quot;고양이&quot;로 판정된 비율입니다.
        </p>
      </div>

      <div className="stage">
        <div className="stage-main">
          <div className="seg" style={{ borderWidth: "0 0 1px 0" }}>
            {(["human", "auto", "results"] as const).map((t) => (
              <button key={t} data-on={tab === t ? "1" : "0"} onClick={() => setTab(t)} style={{ height: 36 }}>
                {t === "human" ? "human judge" : t === "auto" ? "auto (classifier)" : "results"}
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24 }}>
              <p className="note">오른쪽에서 고양이 이미지(대상)와 선택적으로 고양이가 아닌 이미지(대조군)를 넣고 PREPARE를 누르세요. 모든 rank에 대해 실제 인코딩이 수행됩니다.</p>
              {prep && <p className="label mono" style={{ marginTop: 12 }}>encoding {prep}</p>}
            </div>
          ) : (
            <>
              <Strip item={items.find((i) => !i.control) || items[0]} />
              {tab === "human" && <Human items={items} sig={sig} onDone={addTrials} count={humanObs.length} />}
              {tab === "auto" && <Auto items={items} recs={auto} setRecs={setAuto} crit={crit} />}
              {tab === "results" && (
                <Results
                  items={items}
                  human={humanObs}
                  auto={autoObs}
                  autoRecs={auto}
                  sizeOf={sizeOf}
                  tau={tau}
                  xAxis={xAxis}
                  trials={trials.filter((t) => t.sig === sig && keys.has(t.img))}
                  crit={crit}
                />
              )}
            </>
          )}
          {err && <div className="err" style={{ margin: 12 }}>{err}</div>}
        </div>

        <aside>
          <div className="ctl stack">
            <FilePick label={`targets: cat images (${targets.length})`} hint="multiple" multiple onFiles={(f) => setTargets((o) => [...o, ...f])} />
            <FilePick label={`controls: non-cat (${controls.length})`} hint="optional, false-alarm rate" multiple onFiles={(f) => setControls((o) => [...o, ...f])} />
            {(targets.length > 0 || controls.length > 0) && (
              <button className="btn ghost wide" onClick={() => { setTargets([]); setControls([]); setItems([]); setAuto([]); }}>Clear images</button>
            )}
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">rank levels</span><span className="mono">{ranks.length}</span></div>
            <input className="field" value={ranksText} onChange={(e) => setRanksText(e.target.value)} />
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">working size</span></div>
            <div className="seg">{SIZES.map((s) => <button key={s} data-on={size === s ? "1" : "0"} onClick={() => setSize(s)}>{s}</button>)}</div>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">channels / bits</span><span className="mono">{bits}</span></div>
            <div className="seg" style={{ marginBottom: 8 }}>
              <button data-on={mono ? "1" : "0"} onClick={() => setMono(true)}>mono</button>
              <button data-on={!mono ? "1" : "0"} onClick={() => setMono(false)}>color (k<sub>c</sub>=⌈k/4⌉)</button>
            </div>
            <input type="range" min={3} max={7} value={bits} onChange={(e) => setBits(Number(e.target.value))} />
          </div>
          <div className="ctl stack">
            <button className="btn solid wide" disabled={!targets.length || !!prep || !ranks.length} onClick={prepare}>{prep ? "Encoding" : "Prepare"}</button>
            {sig && <span className="label mono">set: {sig} / {items.length} images</span>}
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">criterion <span className="m">τ</span> (collapse threshold)</span><span className="mono">{tau.toFixed(2)}</span></div>
            <input type="range" min={0.05} max={0.95} step={0.05} value={tau} onChange={(e) => setTau(Number(e.target.value))} />
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">x axis</span></div>
            <div className="seg">
              <button data-on={xAxis === "bytes" ? "1" : "0"} onClick={() => setXAxis("bytes")}>file bytes</button>
              <button data-on={xAxis === "ratio" ? "1" : "0"} onClick={() => setXAxis("ratio")}>compression ratio</button>
            </div>
          </div>
          <div className="ctl">
            <div className="ctl-head"><span className="label">auto: judged cat if</span></div>
            <select className="field" value={crit} onChange={(e) => setCrit(e.target.value as "top1" | "top5" | "p50")}>
              <option value="top1">top-1 class ∈ cat (281–285)</option>
              <option value="top5">top-5 contains a cat class</option>
              <option value="p50">Σ P(cat classes) &gt; 0.5</option>
            </select>
          </div>
          <div className="ctl stack">
            <span className="label num">stored human trials: {trials.length}</span>
            <button className="btn ghost wide" disabled={!trials.length} onClick={() => { if (confirm("delete all stored human trials?")) { storeTrials([]); setTrials([]); } }}>Clear trials</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Strip({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid var(--line)" }}>
      {item.levels.map((l) => (
        <div key={l.k} style={{ flex: "0 0 auto", borderRight: "1px solid var(--line)", padding: 6, width: 104 }}>
          <Thumb rgba={l.rgba} w={item.w} h={item.h} />
          <div className="label num" style={{ marginTop: 4 }}>k={l.k}</div>
          <div className="mono" style={{ fontSize: 10 }}>{bytes(l.size)}</div>
        </div>
      ))}
    </div>
  );
}
function Thumb({ rgba, w, h, width = 92 }: { rgba: Uint8ClampedArray; w: number; h: number; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => paint(ref.current, rgba, w, h), [rgba, w, h]);
  return <canvas ref={ref} style={{ width, height: "auto" }} />;
}

/* ------------------------------------------------------------------ */
function Human({ items, sig, onDone, count }: { items: Item[]; sig: string; onDone: (t: Trial[]) => void; count: number }) {
  const [observer, setObserver] = useState("");
  const [order, setOrder] = useState<"ascending" | "random">("ascending");
  const [queue, setQueue] = useState<{ item: Item; level: Level }[] | null>(null);
  const [i, setI] = useState(0);
  const [gap, setGap] = useState(false);
  const done = useRef<Trial[]>([]);
  const shown = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  function start() {
    const byLv = new Map<number, { item: Item; level: Level }[]>();
    items.forEach((it) => it.levels.forEach((l) => {
      if (!byLv.has(l.k)) byLv.set(l.k, []);
      byLv.get(l.k)!.push({ item: it, level: l });
    }));
    let q: { item: Item; level: Level }[];
    if (order === "ascending") {
      q = [];
      Array.from(byLv.keys()).sort((a, b) => a - b).forEach((k) => q.push(...shuffle(byLv.get(k)!)));
    } else {
      q = shuffle(Array.from(byLv.values()).flat());
    }
    done.current = [];
    setI(0);
    setQueue(q);
  }

  const cur = queue && i < queue.length ? queue[i] : null;

  useEffect(() => {
    if (!cur || gap) return;
    paint(canvas.current, cur.level.rgba, cur.item.w, cur.item.h);
    shown.current = performance.now();
  }, [cur, gap]);

  const finish = useCallback(() => {
    if (done.current.length) onDone(done.current);
    done.current = [];
    setQueue(null);
  }, [onDone]);

  const answer = useCallback(
    (yes: boolean) => {
      if (!cur || gap) return;
      done.current.push({
        sig,
        img: cur.item.key,
        control: cur.item.control,
        k: cur.level.k,
        size: cur.level.size,
        ratio: cur.item.orig / cur.level.size,
        yes,
        rt: performance.now() - shown.current,
        observer: observer || "anon",
        t: Date.now(),
      });
      if (queue && i + 1 >= queue.length) {
        finish();
        return;
      }
      setGap(true);
      setTimeout(() => {
        setGap(false);
        setI((x) => x + 1);
      }, 250);
    },
    [cur, gap, sig, observer, queue, i, finish]
  );

  useEffect(() => {
    if (!queue) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") answer(true);
      else if (e.key === "j" || e.key === "J") answer(false);
      else if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [queue, answer, finish]);

  if (queue && cur) {
    return (
      <div>
        <div className="cell-head">
          <span className="label num">trial {i + 1} / {queue.length}</span>
          <span className="label">F = cat / J = not cat / Esc = stop</span>
        </div>
        <div className="view" style={{ minHeight: 420 }}>
          <canvas ref={canvas} style={{ width: "min(100%, 420px)", height: "auto", visibility: gap ? "hidden" : "visible" }} />
        </div>
        <div className="bar"><i style={{ width: `${(i / queue.length) * 100}%` }} /></div>
        <div className="row" style={{ padding: 12, gap: 8 }}>
          <button className="btn solid" style={{ flex: 1, height: 48 }} onClick={() => answer(true)}>Cat (F)</button>
          <button className="btn" style={{ flex: 1, height: 48 }} onClick={() => answer(false)}>Not cat (J)</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }} className="stack">
      <p className="note">
        ascending: 모든 이미지를 가장 낮은 rank부터 한 단계씩 섞어서 보여 줍니다 (높은 rank를 먼저 보고 기억으로 판정하는 효과를 줄이기 위함). random: 완전 무작위.
        응답은 이 브라우저에 저장되며, 같은 이미지 세트와 설정이면 여러 관찰자의 결과가 합산됩니다.
      </p>
      <div className="row" style={{ gap: 8, justifyContent: "flex-start", flexWrap: "wrap" }}>
        <input className="field" style={{ width: 200 }} placeholder="observer id" value={observer} onChange={(e) => setObserver(e.target.value)} />
        <div className="seg" style={{ width: 240 }}>
          <button data-on={order === "ascending" ? "1" : "0"} onClick={() => setOrder("ascending")}>ascending</button>
          <button data-on={order === "random" ? "1" : "0"} onClick={() => setOrder("random")}>random</button>
        </div>
        <button className="btn solid" onClick={start}>Start {items.reduce((s, it) => s + it.levels.length, 0)} trials</button>
      </div>
      <span className="label num">recorded for this set: {count}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Auto({ items, recs, setRecs, crit }: { items: Item[]; recs: AutoRec[]; setRecs: (r: AutoRec[]) => void; crit: string }) {
  const [load, setLoad] = useState<"no" | "loading" | "ready">("no");
  const [lp, setLp] = useState(0);
  const [backend, setBackend] = useState("");
  const [run, setRun] = useState("");
  const [err, setErr] = useState("");

  async function doLoad() {
    setErr("");
    setLoad("loading");
    try {
      const r = await loadClassifier(setLp);
      setBackend(r.backend);
      setLoad("ready");
    } catch (e) {
      setErr((e as Error).message);
      setLoad("no");
    }
  }
  async function doRun() {
    setErr("");
    const out: AutoRec[] = [];
    const total = items.reduce((s, it) => s + it.levels.length + 1, 0);
    let n = 0;
    try {
      for (const it of items) {
        const base = await classify(it.base, it.w, it.h);
        out.push({ img: it.key, control: it.control, k: 0, size: it.orig, ratio: 1, pcat: base.pcat, top1: base.top1, top1Label: base.top1Label, top5: base.top5 });
        setRun(`${++n}/${total}`);
        for (const l of it.levels) {
          const p = await classify(l.rgba, it.w, it.h);
          out.push({ img: it.key, control: it.control, k: l.k, size: l.size, ratio: it.orig / l.size, pcat: p.pcat, top1: p.top1, top1Label: p.top1Label, top5: p.top5 });
          setRun(`${++n}/${total}`);
        }
      }
      setRecs(out);
      setRun("");
    } catch (e) {
      setErr((e as Error).message);
      setRun("");
    }
  }

  return (
    <div style={{ padding: 16 }} className="stack">
      <p className="note">
        분류 모델: ResNet-50 (ImageNet 1000 클래스). 입력은 복호화된 .ak 영상을 중앙 정사각형으로 잘라 224×224로 변환한 것입니다.
        고양이 판정 기준은 오른쪽 메뉴에서 선택합니다 (현재: {crit}). k = 0 행은 압축 전 작업 해상도 원본입니다.
      </p>
      <div className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
        <button className="btn" disabled={load !== "no"} onClick={doLoad}>
          {load === "ready" ? `Model ready (${backend})` : load === "loading" ? `Loading ${Math.round(lp * 100)} %` : `Load model (${MODEL_MB} MB)`}
        </button>
        <button className="btn solid" disabled={load !== "ready" || !!run} onClick={doRun}>{run ? `Classifying ${run}` : "Run"}</button>
      </div>
      {load === "ready" && backend !== "webgl" && <p className="note signal">WebGL을 사용할 수 없어 CPU로 실행합니다. 이미지당 수 초가 걸리며 그동안 화면이 멈출 수 있습니다.</p>}
      {load === "loading" && <div className="bar"><i style={{ width: `${lp * 100}%` }} /></div>}
      {err && <div className="err">{err}</div>}
      {recs.length > 0 && (
        <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto", border: "1px solid var(--line)" }}>
          <table className="t">
            <thead>
              <tr><th>image</th><th>k</th><th>bytes</th><th>P(cat)</th><th style={{ textAlign: "left" }}>top-1</th></tr>
            </thead>
            <tbody>
              {recs.map((r, i) => (
                <tr key={i}>
                  <td>{r.img.split("|")[0]}{r.control ? " (ctrl)" : ""}</td>
                  <td>{r.k || "orig"}</td>
                  <td>{r.size}</td>
                  <td>{r.pcat.toFixed(3)}</td>
                  <td style={{ textAlign: "left" }}>{r.top1Label}{CAT_CLASSES.includes(r.top1) ? " *" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Results(props: {
  items: Item[];
  human: Obs[];
  auto: Obs[];
  autoRecs: AutoRec[];
  sizeOf: (k: number) => { size: number; ratio: number };
  tau: number;
  xAxis: "bytes" | "ratio";
  trials: Trial[];
  crit: string;
}) {
  const { human, auto, sizeOf, tau, xAxis } = props;
  const H = useMemo(() => byLevel(human, sizeOf), [human, sizeOf]);
  const A = useMemo(() => byLevel(auto, sizeOf), [auto, sizeOf]);
  const xOf = (l: { size: number; ratio: number }) => (xAxis === "bytes" ? l.size : l.ratio);

  function analyse(obs: Obs[], L: LevelStat[]) {
    const t = obs.filter((o) => !o.control);
    const fit = logisticFit(t.map((o) => Math.log10(o.size)), t.map((o) => (o.yes ? 1 : 0)));
    const xTau = fit && fit.b > 0 ? Math.pow(10, (logit(tau) - fit.a) / fit.b) : NaN;
    const emp = empiricalMin(L, tau);
    const st = steepest(L);
    const per = perImage(obs, tau);
    const perMed = median(per.filter((p) => p.size !== null).map((p) => p.size as number));
    return { fit, xTau, emp, st, per, perMed };
  }
  const ha = useMemo(() => analyse(human, H), [human, H, tau]); // eslint-disable-line react-hooks/exhaustive-deps
  const aa = useMemo(() => analyse(auto, A), [auto, A, tau]); // eslint-disable-line react-hooks/exhaustive-deps

  // map bytes -> ratio for plotting fit curves and markers on the ratio axis (via mean original size of targets)
  const tgt = props.items.filter((i) => !i.control);
  const meanOrig = tgt.length ? tgt.reduce((s, i) => s + i.orig, 0) / tgt.length : 1;
  const bx = (b: number) => (xAxis === "bytes" ? b : meanOrig / b);

  const series: Series[] = [];
  const markers: Marker[] = [];
  const allSizes = [...H, ...A].map((l) => l.size).filter((v) => isFinite(v) && v > 0);
  const lo = Math.min(...allSizes), hi = Math.max(...allSizes);
  const curve = (fit: { a: number; b: number } | null) => {
    if (!fit || !isFinite(lo)) return null;
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i <= 80; i++) {
      const b = Math.pow(10, Math.log10(lo) + ((Math.log10(hi) - Math.log10(lo)) * i) / 80);
      xs.push(bx(b));
      ys.push(1 / (1 + Math.exp(-(fit.a + fit.b * Math.log10(b)))));
    }
    return { xs, ys };
  };
  if (H.length) {
    const L = H.filter((l) => l.n > 0);
    series.push({ name: "human: cat rate", x: L.map(xOf), y: L.map((l) => l.rate), points: true });
    const c = curve(ha.fit);
    if (c) series.push({ name: "human: logistic fit", x: c.xs, y: c.ys, dash: "4 3" });
    const C = H.filter((l) => l.cn > 0);
    if (C.length) series.push({ name: "human: control false alarm", x: C.map(xOf), y: C.map((l) => l.crate), points: true, line: false, color: "var(--dim)" });
    if (isFinite(ha.xTau)) markers.push({ x: bx(ha.xTau), label: `human fit τ: ${bytes(Math.round(ha.xTau))}` });
  }
  if (A.length) {
    const L = A.filter((l) => l.n > 0);
    series.push({ name: "auto: cat rate", x: L.map(xOf), y: L.map((l) => l.rate), points: true, color: "var(--mid)" });
    const c = curve(aa.fit);
    if (c) series.push({ name: "auto: logistic fit", x: c.xs, y: c.ys, dash: "1 3", color: "var(--mid)" });
    const C = A.filter((l) => l.cn > 0);
    if (C.length) series.push({ name: "auto: control false alarm", x: C.map(xOf), y: C.map((l) => l.crate), points: true, line: false, color: "var(--line)" });
    if (isFinite(aa.xTau)) markers.push({ x: bx(aa.xTau), label: `auto fit τ: ${bytes(Math.round(aa.xTau))}`, color: "var(--mid)" });
  }
  markers.push({ y: tau, label: `τ = ${tau.toFixed(2)}`, color: "var(--mid)" });

  const levelsK = Array.from(new Set([...H, ...A].map((l) => l.k))).sort((a, b) => a - b);
  const autoOrig = props.autoRecs.filter((r) => r.k === 0 && !r.control);

  function csv() {
    const lines = ["mode,observer,image,control,k,bytes,ratio,judged_cat,rt_ms,p_cat,top1"];
    props.trials.forEach((t) => lines.push(["human", t.observer, t.img.split("|")[0], t.control, t.k, t.size, t.ratio.toFixed(3), t.yes ? 1 : 0, t.rt.toFixed(0), "", ""].join(",")));
    props.autoRecs.forEach((r) => lines.push(["auto", "resnet50", r.img.split("|")[0], r.control, r.k, r.size, r.ratio.toFixed(3), "", "", r.pcat.toFixed(5), r.top1Label].join(",")));
    saveBlob(new Blob([lines.join("\n")], { type: "text/csv" }), "size-vs-recognition.csv");
  }

  if (!H.length && !A.length) return <p className="note" style={{ padding: 16 }}>아직 판정 데이터가 없습니다. HUMAN 또는 AUTO 탭에서 실험을 수행하세요.</p>;

  const Summary = ({ name, a, L }: { name: string; a: ReturnType<typeof analyse>; L: LevelStat[] }) => {
    const below = a.emp ? L.filter((l) => l.n > 0 && l.size < a.emp!.size).sort((x, y) => y.size - x.size)[0] : undefined;
    return (
      <div className="ctl" style={{ borderRight: "1px solid var(--line)" }}>
        <div className="label" style={{ marginBottom: 8 }}>{name}</div>
        <dl className="kv">
          <dt>min size ≥ <span className="m">τ</span> (measured)</dt>
          <dd>{a.emp ? `${bytes(Math.round(a.emp.size))} (k=${a.emp.k}, rate ${pct(a.emp.rate, 0)})` : "no level reaches τ"}</dd>
          <dt>next level down</dt>
          <dd>{below ? `${bytes(Math.round(below.size))} (k=${below.k}, rate ${pct(below.rate, 0)})` : "—"}</dd>
          <dt>logistic x at <span className="m">τ</span></dt>
          <dd>{isFinite(a.xTau) ? `${bytes(Math.round(a.xTau))}${a.fit?.separated ? " (separated data)" : ""}` : "fit not available"}</dd>
          <dt>per-image median</dt>
          <dd>{isFinite(a.perMed) ? bytes(Math.round(a.perMed)) : "—"} ({a.per.filter((p) => p.size !== null).length}/{a.per.length} images)</dd>
          <dt>steepest change</dt>
          <dd>{a.st ? `k ${a.st.lo.k} → ${a.st.hi.k} (${bytes(Math.round(a.st.lo.size))} → ${bytes(Math.round(a.st.hi.size))})` : "—"}</dd>
        </dl>
      </div>
    );
  };

  return (
    <div>
      <div style={{ padding: 12 }}>
        <Chart
          height={320}
          xLog
          yDomain={[0, 1.02]}
          xLabel={xAxis === "bytes" ? "mean .ak size (bytes)" : "original / compressed"}
          yLabel="fraction judged cat"
          series={series}
          markers={markers}
          xFmt={xAxis === "bytes" ? (v) => bytes(v) : undefined}
        />
      </div>
      <div className="pair" style={{ borderTop: "1px solid var(--line)" }}>
        {H.length > 0 ? <Summary name={`human (${human.length} trials)`} a={ha} L={H} /> : <div className="ctl"><span className="label">human: no data</span></div>}
        {A.length > 0 ? <Summary name={`auto (${props.crit})`} a={aa} L={A} /> : <div className="ctl"><span className="label">auto: no data</span></div>}
      </div>
      <div style={{ overflowX: "auto", borderTop: "1px solid var(--line)" }}>
        <table className="t">
          <thead>
            <tr>
              <th>k</th><th>mean bytes</th><th>ratio</th><th>human n</th><th>human rate</th><th>ctrl FA</th><th>auto n</th><th>auto rate</th><th>mean P(cat)</th>
            </tr>
          </thead>
          <tbody>
            {autoOrig.length > 0 && (
              <tr>
                <td>orig</td><td>{bytes(Math.round(autoOrig.reduce((s, r) => s + r.size, 0) / autoOrig.length))}</td><td>1</td><td></td><td></td><td></td>
                <td>{autoOrig.length}</td><td></td><td>{fixed(autoOrig.reduce((s, r) => s + r.pcat, 0) / autoOrig.length, 3)}</td>
              </tr>
            )}
            {levelsK.map((k) => {
              const h = H.find((l) => l.k === k), a = A.find((l) => l.k === k);
              const z = sizeOf(k);
              const pc = props.autoRecs.filter((r) => r.k === k && !r.control);
              return (
                <tr key={k} data-hl={ha.emp?.k === k || aa.emp?.k === k ? "1" : "0"}>
                  <td>{k}</td>
                  <td>{bytes(Math.round(z.size))}</td>
                  <td>{fixed(z.ratio, 1)}</td>
                  <td>{h?.n ?? ""}</td>
                  <td>{h && h.n ? pct(h.rate, 0) : ""}</td>
                  <td>{h && h.cn ? pct(h.crate, 0) : ""}</td>
                  <td>{a?.n ?? ""}</td>
                  <td>{a && a.n ? pct(a.rate, 0) : ""}</td>
                  <td>{pc.length ? fixed(pc.reduce((s, r) => s + r.pcat, 0) / pc.length, 3) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ctl row" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="note">
          &quot;min size ≥ τ&quot;: 측정된 rank 중, 그 크기 이상 모든 단계의 판정률이 τ 이상인 가장 작은 파일 크기. 그 바로 아래 단계가 형체가 무너진 첫 단계입니다.
          τ는 사용자가 정하는 판정 기준이며 결과는 측정 데이터에서만 계산됩니다.
        </p>
        <button className="btn ghost" onClick={csv}>Export csv</button>
      </div>
    </div>
  );
}
