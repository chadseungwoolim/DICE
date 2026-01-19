"use client";

import BackButton from "../../components/BackButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type School = {
  id: number;
  name: string;
  code: string;
  region: string | null;
  type: string | null;
};

type ProfileJoin = {
  school_id: number;
  schools: { code: string } | null;
};

type Post = { id: number; title: string; body: string; created_at: string };

export default function SchoolPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const routeCode = params.code;

  const [school, setSchool] = useState<School | null>(null);
  const [schoolError, setSchoolError] = useState<string | null>(null);

  const [mySchoolId, setMySchoolId] = useState<number | null>(null);
  const [mySchoolCode, setMySchoolCode] = useState<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [postStatus, setPostStatus] = useState<string | null>(null);

  const canWrite = useMemo(() => {
    if (!school) return false;
    return mySchoolId === school.id;
  }, [mySchoolId, school]);

  // --- Canvas (낙서) ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const strokesRef = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const currentStroke = useRef<Array<{ x: number; y: number }>>([]);

  function drawAll() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ff6a00";
    ctx.lineCap = "round";

    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i += 1) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }

  function pointerPos(e: PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  async function loadSchoolAndMe() {
    setSchoolError(null);

    if (!routeCode || typeof routeCode !== "string") {
      setSchoolError("잘못된 접근: 학교 코드가 없습니다.");
      return;
    }

    // 1) 학교 정보 로드
    const schoolRes = await supabaseBrowser
      .from("schools")
      .select("id, name, code, region, type")
      .eq("code", routeCode)
      .limit(1);

    if (schoolRes.error) {
      setSchoolError(`학교 로드 실패: ${schoolRes.error.message}`);
      return;
    }

    if (!schoolRes.data || schoolRes.data.length === 0) {
      setSchoolError(`학교를 찾을 수 없습니다. code="${routeCode}"`);
      return;
    }

    const loadedSchool = schoolRes.data[0] as School;
    setSchool(loadedSchool);

    // 2) 내 프로필(소속 학교) 로드
    const userRes = await supabaseBrowser.auth.getUser();
    const user = userRes.data.user;
    if (!user) {
      router.push("/login");
      return;
    }

    const profileRes = await supabaseBrowser
      .from("profiles")
      .select("school_id, schools:schools(code)")
      .eq("id", user.id)
      .limit(1);

    if (profileRes.error) return;

    if (profileRes.data && profileRes.data.length > 0) {
      const row = profileRes.data[0] as unknown as ProfileJoin;
      setMySchoolId(row.school_id);
      setMySchoolCode(row.schools?.code ?? null);
    }
  }

  async function loadPosts(schoolValue: School) {
    const res = await supabaseBrowser
      .from("posts")
      .select("id, title, body, created_at")
      .eq("school_id", schoolValue.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!res.error) setPosts((res.data ?? []) as Post[]);
  }

  async function loadNotes(schoolValue: School) {
    const res = await supabaseBrowser
      .from("gallery_notes")
      .select("data")
      .eq("school_id", schoolValue.id)
      .limit(1);

    if (res.error) return;

    const data = res.data?.[0]?.data as any;
    const strokes = Array.isArray(data?.strokes) ? data.strokes : [];
    strokesRef.current = strokes;
    drawAll();
  }

  async function saveNotes() {
    setNoteStatus(null);
    if (!school) return;

    if (!canWrite) {
      setNoteStatus("주석(낙서)은 본인 학교에서만 가능합니다.");
      return;
    }

    const payload = { strokes: strokesRef.current };

    const res = await supabaseBrowser
      .from("gallery_notes")
      .upsert({ school_id: school.id, data: payload, updated_at: new Date().toISOString() });

    if (res.error) {
      setNoteStatus(`저장 실패: ${res.error.message}`);
      return;
    }
    setNoteStatus("저장됨");
  }

  async function createPost() {
    setPostStatus(null);
    if (!school) return;

    if (!canWrite) {
      setPostStatus("글 작성은 본인 학교에서만 가능합니다.");
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (trimmedTitle.length < 1 || trimmedBody.length < 1) {
      setPostStatus("제목/내용을 입력해 주세요.");
      return;
    }

    const userRes = await supabaseBrowser.auth.getUser();
    const user = userRes.data.user;
    if (!user) {
      setPostStatus("로그인이 필요합니다.");
      router.push("/login");
      return;
    }

    const res = await supabaseBrowser.from("posts").insert({
      school_id: school.id,
      author_id: user.id,
      title: trimmedTitle,
      body: trimmedBody,
    });

    if (res.error) {
      setPostStatus(`작성 실패: ${res.error.message}`);
      return;
    }

    setTitle("");
    setBody("");
    setPostStatus("작성됨");
    await loadPosts(school);
  }

  // 최초 로드: 학교/내 정보
  useEffect(() => {
    loadSchoolAndMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCode]);

  // school이 정해지면: posts/notes + canvas 이벤트
  useEffect(() => {
    if (!school) return;

    loadPosts(school);
    loadNotes(school);

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 900;
    canvas.height = 520;
    drawAll();

    const onDown = (e: PointerEvent) => {
      if (!canWrite) return;
      drawing.current = true;
      currentStroke.current = [pointerPos(e)];
      strokesRef.current.push(currentStroke.current);
      drawAll();
    };

    const onMove = (e: PointerEvent) => {
      if (!drawing.current) return;
      currentStroke.current.push(pointerPos(e));
      drawAll();
    };

    const onUp = () => {
      drawing.current = false;
      currentStroke.current = [];
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id, canWrite]);

  if (!school) {
    return (
      <main className="hero">
        <BackButton />
        <div className="brandWrap">
          <div className="hint">{schoolError ?? "학교를 불러오는 중..."}</div>

          {schoolError ? (
            <div className="hint" style={{ marginTop: 10 }}>
              Supabase <b>schools</b> 테이블에 이 <b>code</b>가 존재하는지 확인하세요.
              <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
                현재 요청 code: <b>{String(routeCode)}</b>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", padding: 18 }}>
      <BackButton />

      <div style={{ display: "flex", justifyContent: "center", marginTop: 10, marginBottom: 18 }}>
        <div className="brand" style={{ fontSize: "min(10vh, 110px)" }}>
          {school.name}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, alignItems: "start" }}>
        {/* ================= 좌측 게시판 ================= */}
        <section
          style={{
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 14,
            background: "var(--panel)",
          }}
        >
          <div
            style={{
              color: "var(--orange)",
              fontWeight: 900,
              marginBottom: 10,
              fontSize: 18,
            }}
          >
            게시판
          </div>

          {/* ---------- 글 작성 ---------- */}
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <input
              className="searchInput"
              placeholder={canWrite ? "제목" : "본인 학교에서만 작성 가능"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canWrite}
            />

            <textarea
              className="searchInput"
              placeholder={canWrite ? "내용" : "보기만 가능합니다"}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!canWrite}
              style={{ minHeight: 120, resize: "vertical" }}
            />

            <button className="searchButton" onClick={createPost} disabled={!canWrite}>
              글 올리기
            </button>

            {postStatus ? (
              <div style={{ color: postStatus.includes("실패") ? "#ff5a5f" : "var(--muted)" }}>{postStatus}</div>
            ) : null}
          </div>

          {/* ---------- 글 목록 (클릭하면 상세로) ---------- */}
          <div style={{ display: "grid", gap: 10 }}>
            {posts.length === 0 ? <div style={{ color: "var(--muted)" }}>아직 글이 없습니다.</div> : null}

            {posts.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/s/${school.code}/post/${p.id}`)}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 14,
                  padding: 12,
                  background: "#0f0f11",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 15 }}>{p.title}</div>

                <div
                  style={{
                    color: "var(--muted)",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.body}
                </div>

                <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                  {new Date(p.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ================= 우측 갤러리(낙서) ================= */}
        <section style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 14, background: "var(--panel)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ color: "var(--orange)", fontWeight: 900 }}>갤러리 주석(낙서)</div>
            <button className="searchButton" onClick={saveNotes} disabled={!canWrite}>
              저장
            </button>
          </div>

          <div style={{ color: "var(--muted)", marginBottom: 10 }}>
            {canWrite ? "마우스로 낙서하고 저장하세요. (본인 학교만 가능)" : "다른 학교 갤러리는 보기만 가능합니다."}
          </div>

          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: 520,
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "#0b0b0c",
              touchAction: "none",
            }}
          />

          {noteStatus ? (
            <div style={{ marginTop: 10, color: noteStatus.includes("실패") ? "#ff5a5f" : "var(--muted)" }}>
              {noteStatus}
            </div>
          ) : null}
        </section>
      </div>

      <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 12 }}>
        내 학교 코드: {mySchoolCode ?? "?"} / 현재 갤러리: {school.code}
      </div>
    </main>
  );
}