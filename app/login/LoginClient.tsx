"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type School = { id: number; name: string; code: string };

// ✅ 이메일은 “진짜 이메일 형태”여야 Supabase Auth가 통과함
function makeSafeEmail(username: string, schoolCode: string) {
  const u = username.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const sc = String(schoolCode ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (u.length < 3) return null;
  // example.com은 “형태만” 맞추는 용도 (실제 메일 발송 안 함: password 로그인)
  return `${u}.${sc || "school"}@example.com`;
}

// ✅ 공백/대소문자/붙여쓰기 대응 검색용 정규화
function normalizeKoreanSearch(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();

  // 원하면 next를 살릴 수도 있지만, 너 요구대로 “항상 홈”으로 보냄
  // const nextPath = params.get("next") ?? "/";
  const nextPath = "/";

  const [schoolsAll, setSchoolsAll] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);

  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolId, setSchoolId] = useState<number | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [classText, setClassText] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ✅ Supabase에서 학교 목록 “페이징(range)”로 전부 긁어오기
  useEffect(() => {
    let cancelled = false;

    async function loadAllSchools() {
      setStatus(null);
      setLoadingSchools(true);

      const pageSize = 1000;
      let from = 0;
      const collected: School[] = [];

      while (true) {
        const to = from + pageSize - 1;

        const res = await supabaseBrowser
          .from("schools")
          .select("id, name, code")
          .order("id", { ascending: true })
          .range(from, to);

        if (cancelled) return;

        if (res.error) {
          setStatus(`학교 목록 로드 실패: ${res.error.message}`);
          setLoadingSchools(false);
          return;
        }

        const chunk = (res.data ?? []) as School[];
        collected.push(...chunk);

        if (chunk.length < pageSize) break;
        from += pageSize;

        // 안전장치 (무한루프 방지)
        if (from > 200000) {
          setStatus("학교 목록이 비정상적으로 큽니다. DB를 확인해 주세요.");
          setLoadingSchools(false);
          return;
        }
      }

      if (!cancelled) {
        setSchoolsAll(collected);
        setLoadingSchools(false);
      }
    }

    loadAllSchools();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ 검색(프론트 필터): 공백 제거/부분일치/대소문자 무시
  const filteredSchools = useMemo(() => {
    const q = normalizeKoreanSearch(schoolQuery);
    if (q.length === 0) return schoolsAll;

    return schoolsAll.filter((s) => {
      const nameN = normalizeKoreanSearch(s.name);
      return nameN.includes(q);
    });
  }, [schoolsAll, schoolQuery]);

  const selectedSchool = useMemo(
    () => (schoolId ? schoolsAll.find((s) => s.id === schoolId) ?? null : null),
    [schoolsAll, schoolId]
  );

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

    if (!selectedSchool) return setStatus("학교를 먼저 선택해 주세요.");
    if (username.trim().length < 3) return setStatus("아이디는 3글자 이상(영문/숫자)으로 입력해 주세요.");
    if (password.length < 6) return setStatus("비밀번호는 6글자 이상으로 입력해 주세요.");
    if (classText.trim().length < 1) return setStatus("반을 입력해 주세요.");

    const email = makeSafeEmail(username, selectedSchool.code);
    if (!email) return setStatus("아이디는 영문/숫자만 사용해 주세요 (3글자 이상).");

    setBusy(true);

    // 1) 로그인 시도
    const signIn = await supabaseBrowser.auth.signInWithPassword({ email, password });

    // 2) 실패하면 회원가입
    if (signIn.error) {
      const signUp = await supabaseBrowser.auth.signUp({ email, password });
      if (signUp.error) {
        setBusy(false);
        return setStatus(`로그인/가입 실패: ${signUp.error.message}`);
      }
    }

    // 3) 사용자 확보
    const u = (await supabaseBrowser.auth.getUser()).data.user;
    if (!u) {
      setBusy(false);
      return setStatus("로그인 성공했지만 사용자 정보를 가져오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    }

    // 4) 프로필 저장
    try {
      await upsertProfile(u.id, selectedSchool.id, classText);
    } catch (err: any) {
      setBusy(false);
      return setStatus(`프로필 저장 실패: ${err?.message ?? "unknown"}`);
    }

    setBusy(false);

    // ✅ 요구사항: 로그인 후 “홈”으로 이동
    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className="hero">
      <div className="brandWrap" style={{ gap: 12 }}>
        <div className="brand" style={{ fontSize: "min(14vh, 140px)" }}>DICE</div>

        {/* 검색창 (예: 부산일과학고) 다시 복구 */}
        <input
          className="searchInput"
          placeholder="학교 검색 (예: 부산일과학고)"
          value={schoolQuery}
          onChange={(e) => setSchoolQuery(e.target.value)}
        />

        <div className="hint" style={{ marginTop: -4 }}>
          {loadingSchools
            ? "학교 목록 불러오는 중..."
            : `학교 ${schoolsAll.length}개 로드됨 / 검색 결과 ${filteredSchools.length}개`}
        </div>

        <select
          value={schoolId ?? ""}
          onChange={(e) => setSchoolId(e.target.value ? Number(e.target.value) : null)}
          style={{
            background: "transparent",
            border: "2px solid var(--orange)",
            color: "var(--orange)",
            padding: "14px 16px",
            borderRadius: 14,
            outline: "none",
          }}
        >
          <option value="" style={{ color: "#000" }}>
            학교를 선택해 주세요
          </option>
          {filteredSchools.map((s) => (
            <option key={s.id} value={s.id} style={{ color: "#000" }}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          className="searchInput"
          placeholder="아이디(영문/숫자, 3글자 이상)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="searchInput"
          type="password"
          placeholder="비밀번호(6글자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="searchInput"
          placeholder="반 (예: 2-3 또는 3반)"
          value={classText}
          onChange={(e) => setClassText(e.target.value)}
        />

        <button className="searchButton" onClick={doAuth} disabled={busy || loadingSchools}>
          {busy ? "..." : "로그인 / 가입"}
        </button>

        {status ? <div style={{ color: "#ff5a5f" }}>{status}</div> : null}
      </div>
    </main>
  );
}
