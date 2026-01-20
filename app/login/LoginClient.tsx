"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import BackButton from "@/app/components/BackButton";

type School = { id: number; name: string; code: string };

function makeEmail(username: string, schoolCode: string) {
  const u = username.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const sc = String(schoolCode ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!u || !sc) return null;
  return `${u}.${sc}@example.com`;
}

function norm(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") ?? "/";

  const [schoolsAll, setSchoolsAll] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [classText, setClassText] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadAllSchoolsPaged() {
      setLoading(true);
      setStatus(null);

      const pageSize = 1000;
      let from = 0;
      const collected: School[] = [];

      while (true) {
        const to = from + pageSize - 1;

        const res = await supabaseBrowser
          .from("schools")
          .select("id, name, code")
          .order("name", { ascending: true })
          .range(from, to);

        if (res.error) {
          if (!alive) return;
          setLoading(false);
          setStatus(`학교 목록 로드 실패: ${res.error.message}`);
          setSchoolsAll([]);
          return;
        }

        const chunk = (res.data ?? []) as School[];
        collected.push(...chunk);

        if (chunk.length < pageSize) break;
        from += pageSize;

        if (from > 300000) {
          if (!alive) return;
          setLoading(false);
          setStatus("학교 데이터가 비정상적으로 많습니다(루프 보호).");
          setSchoolsAll(collected);
          return;
        }
      }

      if (!alive) return;
      setSchoolsAll(collected);
      setLoading(false);

      if (collected.length === 0) {
        setStatus("학교가 0개입니다. Supabase RLS/권한 또는 테이블명을 확인하세요.");
      }
    }

    loadAllSchoolsPaged();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return schoolsAll;

    return schoolsAll.filter((s) => norm(s.name).includes(q));
  }, [schoolsAll, query]);

  const selected = useMemo(() => {
    if (!schoolId) return null;
    return schoolsAll.find((s) => s.id === schoolId) ?? null;
  }, [schoolsAll, schoolId]);

  async function upsertProfile(userId: string, chosenSchoolId: number, classValue: string) {
    const res = await supabaseBrowser.from("profiles").upsert({
      id: userId,
      school_id: chosenSchoolId,
      class: classValue.trim(),
    });
    if (res.error) throw res.error;
  }

  async function doAuth() {
    setStatus(null);

    if (!selected) return setStatus("학교를 선택해 주세요.");
    if (username.trim().length < 3) return setStatus("아이디는 3자 이상");
    if (password.length < 6) return setStatus("비밀번호는 6자 이상");
    if (!classText.trim()) return setStatus("반을 입력해 주세요.");

    const email = makeEmail(username, selected.code);
    if (!email) return setStatus("아이디는 영문/숫자만");

    setBusy(true);

    const signIn = await supabaseBrowser.auth.signInWithPassword({ email, password });

    if (signIn.error) {
      const signUp = await supabaseBrowser.auth.signUp({ email, password });
      if (signUp.error) {
        setBusy(false);
        return setStatus(`로그인/가입 실패: ${signUp.error.message}`);
      }
    }

    const u = (await supabaseBrowser.auth.getUser()).data.user;
    if (!u) {
      setBusy(false);
      return setStatus("로그인 후 사용자 정보를 가져오지 못했습니다.");
    }

    try {
      await upsertProfile(u.id, selected.id, classText);
    } catch (err: any) {
      setBusy(false);
      return setStatus(`프로필 저장 실패: ${err?.message ?? "unknown"}`);
    }

    setBusy(false);

    if (nextPath.startsWith("/")) router.push(nextPath);
    else router.push("/");
  }

  const inputStyle: React.CSSProperties = {
    height: 40,
    padding: "9px 12px",
    fontSize: 14,
    borderRadius: 12,
  };

  const selectStyle: React.CSSProperties = {
    height: 40,
    padding: "8px 12px",
    fontSize: 14,
    borderRadius: 12,
    border: "2px solid var(--orange)",
    background: "transparent",
    color: "var(--orange)",
    outline: "none",
  };

  return (
    <main className="hero">
      <div style={{ position: "fixed", top: 18, left: 18, zIndex: 50 }}>
        <BackButton fallback="/" />
      </div>

      <div className="brandWrap" style={{ gap: 10 }}>
        <div className="brand" style={{ fontSize: "min(10vh, 110px)" }}>
          DICE
        </div>

        <div style={{ width: "min(560px, 92vw)", display: "grid", gap: 8 }}>
          <input
            className="searchInput"
            style={inputStyle}
            placeholder="학교 검색 (예: 부산일과학고)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            value={schoolId ?? ""}
            onChange={(e) => setSchoolId(e.target.value ? Number(e.target.value) : null)}
            style={selectStyle}
            disabled={loading}
          >
            <option value="" style={{ color: "#000" }}>
              {loading
                ? "학교 목록 불러오는 중..."
                : `학교 선택 (총 ${schoolsAll.length}개 / 현재 ${filtered.length}개)`}
            </option>
            {filtered.map((s) => (
              <option key={s.id} value={s.id} style={{ color: "#000" }}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            className="searchInput"
            style={inputStyle}
            placeholder="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            className="searchInput"
            style={inputStyle}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            className="searchInput"
            style={inputStyle}
            placeholder="반 (예: 2-3)"
            value={classText}
            onChange={(e) => setClassText(e.target.value)}
          />

          <button
            className="searchButton"
            onClick={doAuth}
            disabled={busy || loading}
            style={{ height: 42, borderRadius: 12 }}
          >
            {busy ? "..." : "로그인 / 가입"}
          </button>

          {status ? <div style={{ color: "#ff5a5f", fontSize: 13 }}>{status}</div> : null}
        </div>
      </div>
    </main>
  );
}
