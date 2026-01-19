"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type SchoolRow = {
  code: string;
  name: string;
};

/** =========================
 *  스크롤 아래: 전체 낙서 벽
 *  - 주황색만
 *  - 중앙 DICE 200pt
 *  - 선은 10초 후 자동 삭제
 *  - DB 저장 없음
 * ========================= */
type Point = { x: number; y: number };
type Stroke = { points: Point[]; createdAt: number };

function GraffitiWall() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);

  function getPos(e: PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function drawAll() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 캔버스는 resizeCanvas에서 "CSS 픽셀 좌표계"로 맞춰둠
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // clear (CSS 픽셀 단위로 clear)
    ctx.clearRect(0, 0, w, h);

    // 중앙 DICE (CSS 픽셀 기준 정중앙)
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ff6a00";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 200px Helvetica Neue, Helvetica, Arial, sans-serif";
    ctx.fillText("DICE", w / 2, h / 2);
    ctx.restore();

    // strokes (주황색만)
    ctx.strokeStyle = "#ff6a00";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }

  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // 내부 픽셀 크기
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 좌표계를 CSS 픽셀로 맞춤 (이제 ctx는 x,y를 rect 기준으로 받음)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawAll();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    resizeCanvas();

    const onDown = (e: PointerEvent) => {
      drawingRef.current = true;
      const first = getPos(e);
      currentStrokeRef.current = [first];
      strokesRef.current.push({ points: currentStrokeRef.current, createdAt: Date.now() });
      drawAll();
    };

    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      currentStrokeRef.current.push(getPos(e));
      drawAll();
    };

    const onUp = () => {
      drawingRef.current = false;
      currentStrokeRef.current = [];
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", resizeCanvas);

    // 10초 후 자동 삭제 (동작은 유지, 메시지만 제거)
    const timer = window.setInterval(() => {
      const now = Date.now();
      strokesRef.current = strokesRef.current.filter((s) => now - s.createdAt < 10_000);
      drawAll();
    }, 500);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", resizeCanvas);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section
      style={{
        width: "100%",
        height: "80vh",
        marginTop: 80,
        borderTop: "2px solid rgba(255,106,0,0.40)",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0b0c",
          touchAction: "none",
          display: "block",
        }}
      />
    </section>
  );
}

/** =========================
 *  홈 페이지
 * ========================= */
export default function HomePage() {
  const router = useRouter();
  const [queryText, setQueryText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const normalized = useMemo(() => queryText.trim(), [queryText]);

  function goLogin() {
    router.push("/login");
  }

  async function searchSchool() {
    setErrorMessage(null);

    if (normalized.length < 1) {
      setErrorMessage("학교 이름을 입력해 주세요.");
      return;
    }

    setIsSearching(true);

    const result = await supabaseBrowser
      .from("schools")
      .select("code, name")
      .ilike("name", `%${normalized}%`)
      .limit(1);

    setIsSearching(false);

    if (result.error) {
      setErrorMessage("학교 목록을 불러오지 못했습니다.");
      return;
    }

    const rows = (result.data ?? []) as SchoolRow[];
    if (rows.length === 0) {
      setErrorMessage("해당 학교를 찾을 수 없습니다. 철자를 확인해 주세요.");
      return;
    }

    router.push(`/s/${rows[0].code}`);
  }

  return (
    <>
      <main className="hero">
        <div className="topbar">
          <button className="loginButton" onClick={goLogin} aria-label="login">
            <div className="loginTextOnHead">login</div>
            <svg className="loginIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 12.2c2.3 0 4.2-1.9 4.2-4.2S14.3 3.8 12 3.8 7.8 5.7 7.8 8s1.9 4.2 4.2 4.2Z"
                stroke="var(--orange)"
                strokeWidth="2"
              />
              <path
                d="M4.6 20.2c1.8-3.6 5-5.3 7.4-5.3s5.6 1.7 7.4 5.3"
                stroke="var(--orange)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="brandWrap">
          <div className="brand">DICE</div>

          <div className="searchRow">
            <input
              className="searchInput"
              placeholder="학교 이름을 적어 주세요"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") searchSchool();
              }}
            />
            <button className="searchButton" onClick={searchSchool} disabled={isSearching}>
              {isSearching ? "..." : "검색"}
            </button>
          </div>

          <div className="hint">학교 이름을 검색하면 해당 학교의 갤러리로 들어갑니다.</div>

          {errorMessage ? <div style={{ color: "#ff5a5f" }}>{errorMessage}</div> : null}
        </div>
      </main>

      {/* ✅ 스크롤 아래에 거대한 낙서 벽 */}
      <GraffitiWall />
    </>
  );
}