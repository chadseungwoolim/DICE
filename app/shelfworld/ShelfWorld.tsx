"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { assetBase } from "@/lib/platform";
import { CLASSES, divisionCode, divisionName } from "@/lib/shelfworld/kdc";
import { placeOf, type Place } from "@/lib/shelfworld/layout";
import type { Book } from "@/lib/shelfworld/nl";
import type { ViewMode, World } from "@/lib/shelfworld/engine";

type Target = "total" | "title" | "author" | "publisher" | "cheonggu";
const TARGETS: { v: Target; label: string }[] = [
  { v: "total", label: "전체" },
  { v: "title", label: "서명" },
  { v: "author", label: "저자" },
  { v: "publisher", label: "출판사" },
  { v: "cheonggu", label: "청구기호" },
];
const EXAMPLES = ["코스모스", "소년이 온다", "사피엔스", "모두의 딥러닝"];

interface List {
  kind: "search" | "shelf";
  title: string;
  total: number;
  page: number;
  items: Book[];
  q?: string;
  target?: Target;
  div?: number;
}

function where(p: Place | null): string {
  if (!p) return "서가 자리 없음";
  return `${divisionCode(p.div)} ${divisionName(p.div)} · ${p.tier + 1}단 ${p.col + 1}번째`;
}

async function api(params: Record<string, string>) {
  const res = await fetch(`${assetBase()}/api/nl?${new URLSearchParams(params)}`);
  let body: { error?: string; total?: number; page?: number; items?: Book[] } = {};
  try {
    body = await res.json();
  } catch {}
  if (!res.ok || body.error) throw new Error(body.error || `요청 실패 (${res.status})`);
  return body;
}

export default function ShelfWorld() {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const [failed, setFailed] = useState("");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewMode>("walk");
  const [facing, setFacing] = useState<number | null>(null);
  const facingRef = useRef<number | null>(null);

  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Target>("total");
  const [list, setList] = useState<List | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<Book | null>(null);
  const reqId = useRef(0);

  const browse = useCallback(async (div: number) => {
    const id = ++reqId.current;
    setBusy(true);
    setErr("");
    setList({ kind: "shelf", title: `${divisionCode(div)} ${divisionName(div)}`, total: 0, page: 1, items: [], div });
    try {
      const r = await api({ type: "shelf", div: String(div).padStart(2, "0") });
      if (id !== reqId.current) return;
      const items = r.items || [];
      setList({ kind: "shelf", title: `${divisionCode(div)} ${divisionName(div)}`, total: items.length, page: 1, items, div });
    } catch (e) {
      if (id === reqId.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, []);
  const browseRef = useRef(browse);
  browseRef.current = browse;

  useEffect(() => {
    let alive = true;
    let w: World | null = null;
    (async () => {
      try {
        const probe = document.createElement("canvas");
        if (!probe.getContext("webgl2") && !probe.getContext("webgl")) throw new Error("이 브라우저는 WebGL을 지원하지 않아 3D 서가를 열 수 없습니다.");
        const { createWorld } = await import("@/lib/shelfworld/engine");
        if (!alive || !host.current) return;
        w = createWorld(host.current, map.current, {
          onFacing: (d) => {
            facingRef.current = d;
            setFacing(d);
          },
          onInteract: () => {
            if (facingRef.current !== null) browseRef.current(facingRef.current);
          },
        });
        world.current = w;
        setReady(true);
      } catch (e) {
        if (alive) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
      w?.dispose();
      world.current = null;
    };
  }, []);

  async function search(query: string, t: Target, page = 1) {
    const s = query.trim();
    if (!s) return;
    const id = ++reqId.current;
    setBusy(true);
    setErr("");
    try {
      const r = await api({ type: "search", q: s, target: t, page: String(page) });
      if (id !== reqId.current) return;
      setList({ kind: "search", title: `"${s}"`, total: r.total || 0, page, items: r.items || [], q: s, target: t });
    } catch (e) {
      if (id === reqId.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }

  function pick(b: Book) {
    setSel(b);
    const p = placeOf(b.classNo, b.id, b.kdc);
    if (p) world.current?.locate(p);
    else world.current?.clear();
  }
  function stop() {
    setSel(null);
    world.current?.clear();
  }
  function changeView(v: ViewMode) {
    setView(v);
    world.current?.setView(v);
  }
  function goTo(div: number) {
    world.current?.goTo(div);
    setView("walk");
  }

  const selPlace = sel ? placeOf(sel.classNo, sel.id, sel.kdc) : null;
  const pages = list && list.kind === "search" ? Math.max(1, Math.ceil(list.total / 30)) : 1;
  const hold = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      world.current?.press(k, true);
    },
    onPointerUp: () => world.current?.press(k, false),
    onPointerCancel: () => world.current?.press(k, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="wrap sw">
      <div className="section-head">
        <div>
          <div className="label">SHELFWORLD</div>
          <h1 className="h2">국립중앙도서관의 모든 책이 꽂힌 서가</h1>
        </div>
        <p className="note sw-lede">
          소장 도서를 검색하면 KDC 청구기호에 해당하는 자리의 LED가 깜빡입니다. 서가 앞에서 E를 누르면 그 분류의 책을 불러옵니다.
        </p>
      </div>

      <div className="sw-stage">
        <div className="sw-view">
          <div ref={host} className="sw-canvas" aria-label="3D 서가. WASD 또는 방향키로 이동, 드래그로 시점 회전" />
          {!ready && <div className="sw-overlay label">{failed || "서가를 세우는 중"}</div>}
          <div className="sw-hud sw-tl">
            <span className="label">위치</span>
            <span className="mono">{facing === null ? "통로" : `${divisionCode(facing)} ${divisionName(facing)}`}</span>
          </div>
          <div className="seg sw-tr">
            <button data-on={view === "walk" ? "1" : "0"} onClick={() => changeView("walk")}>
              걷기
            </button>
            <button data-on={view === "plan" ? "1" : "0"} onClick={() => changeView("plan")}>
              평면
            </button>
          </div>
          {sel && (
            <div className="sw-signal">
              <i className="sw-dot" />
              <div className="sw-signal-t">
                <b>{sel.title}</b>
                <span className="mono">{selPlace ? where(selPlace) : "KDC 분류가 없어 자리를 정할 수 없습니다"}</span>
              </div>
              {selPlace && (
                <button className="btn" onClick={() => goTo(selPlace.div)}>
                  그 자리로
                </button>
              )}
              <button className="btn solid" onClick={stop}>
                찾았어요
              </button>
            </div>
          )}
          {facing !== null && (
            <button className="btn solid sw-e" onClick={() => browse(facing)}>
              E &nbsp; {divisionCode(facing)} 서가 보기
            </button>
          )}
          <canvas ref={map} className="sw-map" width={140} height={180} />
          <div className="sw-pad" aria-hidden="true">
            <span />
            <button {...hold("w")}>↑</button>
            <span />
            <button {...hold("a")}>←</button>
            <button {...hold("s")}>↓</button>
            <button {...hold("d")}>→</button>
          </div>
          <div className="sw-keys label">WASD 이동 · Shift 달리기 · 드래그 회전 · 휠 확대 · E 서가 보기</div>
        </div>

        <aside className="sw-side">
          <form
            className="sw-search"
            onSubmit={(e) => {
              e.preventDefault();
              search(q, target);
            }}
          >
            <div className="seg">
              {TARGETS.map((t) => (
                <button type="button" key={t.v} data-on={target === t.v ? "1" : "0"} onClick={() => setTarget(t.v)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="sw-qrow">
              <input
                className="field big"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={target === "cheonggu" ? "예: 813.7" : "서명, 저자, 키워드"}
                aria-label="국립중앙도서관 소장 도서 검색"
                maxLength={100}
              />
              <button className="btn solid tall" disabled={busy || !q.trim()}>
                검색
              </button>
            </div>
          </form>

          {err && <div className="err sw-pad-x">{err}</div>}

          {sel && (
            <div className="sw-detail">
              <div className="sw-detail-top">
                {sel.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sel.image}
                    alt=""
                    className="sw-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <div className="sw-cover sw-nocover mono">{sel.classNo || "—"}</div>
                )}
                <div className="sw-detail-t">
                  <b>{sel.title}</b>
                  <span className="muted">{sel.author}</span>
                </div>
              </div>
              <dl className="kv">
                <dt>발행</dt>
                <dd>{[sel.publisher, sel.year].filter(Boolean).join(", ") || "—"}</dd>
                <dt>ISBN</dt>
                <dd>{sel.isbn || "—"}</dd>
                <dt>청구기호</dt>
                <dd>{sel.callNo || "—"}</dd>
                <dt>서가</dt>
                <dd className={selPlace ? "signal" : ""}>{where(selPlace)}</dd>
                <dt>소장</dt>
                <dd>{sel.place || "—"}</dd>
              </dl>
              {sel.link && (
                <a className="link" href={sel.link} target="_blank" rel="noreferrer">
                  국립중앙도서관에서 보기 ↗
                </a>
              )}
            </div>
          )}

          <div className="sw-list-head">
            <span className="label">{list ? (list.kind === "shelf" ? `서가 ${list.title}` : `검색 ${list.title}`) : "책 찾기"}</span>
            {list && <span className="num muted">{busy ? "불러오는 중" : `${list.total.toLocaleString("ko-KR")}권`}</span>}
          </div>

          <div className="sw-list">
            {!list && !busy && (
              <div className="sw-empty">
                <p className="note">국립중앙도서관 소장 도서 전체에서 찾습니다. 결과를 누르면 그 책의 자리에 불이 들어옵니다.</p>
                <div className="chips">
                  {EXAMPLES.map((x) => (
                    <button
                      key={x}
                      className="chip-btn"
                      onClick={() => {
                        setQ(x);
                        setTarget("total");
                        search(x, "total");
                      }}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {list && !busy && list.items.length === 0 && <p className="note sw-empty">찾은 책이 없습니다.</p>}
            {list?.items.map((b) => {
              const p = placeOf(b.classNo, b.id, b.kdc);
              return (
                <button key={b.id} className="sw-row" data-on={sel?.id === b.id ? "1" : "0"} onClick={() => pick(b)}>
                  <span className="sw-row-t">{b.title}</span>
                  <span className="sw-row-m">{[b.author, b.publisher, b.year].filter(Boolean).join(" · ")}</span>
                  <span className="sw-row-c mono">
                    {b.callNo || "청구기호 없음"}
                    <span className="muted"> · {p ? `${divisionCode(p.div)} 서가 ${p.tier + 1}단` : "자리 없음"}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {list && list.kind === "search" && pages > 1 && (
            <div className="sw-pager">
              <button className="btn ghost" disabled={busy || list.page <= 1} onClick={() => search(list.q!, list.target!, list.page - 1)}>
                이전
              </button>
              <span className="num muted">
                {list.page} / {pages.toLocaleString("ko-KR")}
              </span>
              <button
                className="btn ghost"
                disabled={busy || list.page >= Math.min(pages, 100)}
                onClick={() => search(list.q!, list.target!, list.page + 1)}
              >
                다음
              </button>
            </div>
          )}
        </aside>
      </div>

      <div className="sw-index">
        {CLASSES.map((c, i) => (
          <button key={c} onClick={() => goTo(i * 10)}>
            <span className="num">{i}00</span>
            <span>{c}</span>
          </button>
        ))}
      </div>
      <p className="note sw-foot">
        자료 출처: 국립중앙도서관 소장자료 검색 Open API. 3D 서가의 자리는 KDC 분류번호로 계산한 가상 위치이며 국립중앙도서관의 실제 배가 위치가 아닙니다.
      </p>
    </div>
  );
}
