"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type School = { id: number; name: string; code: string };

// ✅ Supabase Auth는 "진짜 이메일"만 허용함.
// .local 같은 도메인은 invalid로 거부될 수 있으니, 테스트용 예약 도메인 example.com 사용
function makeLoginEmail(schoolCode: string, username: string) {
  const safeUser = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // 영문/숫자만

  const safeSchool = schoolCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // 영문/숫자만

  // 예: imesngw.sch1454@example.com
  return `${safeUser}.${safeSchool}@example.com`;
}

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") ?? "/";

  const [schoolsAll, setSchoolsAll] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [schoolQuery, setSchoolQuery] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [classText, setClassText] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 학교명 검색(프론트 필터)
  const schools = useMemo(() => {
    const q = schoolQuery.trim();
    if (q.length === 0) return schoolsAll;

    const lowered = q.toLowerCase();
    const compact = lowered.replaceAll(" ", "");

    return schoolsAll.filter((s) => {
      const nameLower = s.name.toLowerCase();
      const nameCompact = nameLower.replaceAll(" ", "");
      return nameLower.includes(lowered) || nameCompact.includes(compact);
    });
  }, [schoolQuery, schoolsAll]);

  const selectedSchool = useMemo(
    () => schoolsAll.find((s) => s.id === schoolId) ?? null,
    [schoolsAll, schoolId]
  );

  useEffect(() => {
    async function loadSchoolsAllWithPaging() {
      setStatus(null);

      const pageSize = 1000;
      let fromIndex = 0;

      const collected: School[] = [];

      while (true) {
        const toIndex = fromIndex + pageSize - 1;

        const res = await supabaseBrowser
          .from("schools")
          .select("id, name, code")
          .order("name", { ascending: true })
          .range(fromIndex, toIndex);

        if (res.error) {
          setStatus(`학교 목록 로드 실패: ${res.error.message}`);
          return;
        }

        const chunk = (res.data ?? []) as School[];
        collected.push(...chunk);

        if (chunk.length < pageSize) break;

        fromIndex += pageSize;

        // 무한루프 보호
        if (fromIndex > 200000) {
          setStatus("학교 수가 비정상적으로 많습니다. 데이터/정렬을 확인해 주세요.");
          return;
        }
      }

      setSchoolsAll(collected);
    }

    loadSchoolsAllWithPaging();
  }, []);

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

    if (!selectedSchool) return setStatus("학교를 선택해 주세요.");

    // makeLoginEmail이 영문/숫자만 남기므로, username이 한글이면 전부 제거되어 빈 문자열이 될 수 있음
    const safeUser = username.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (safeUser.length < 3) return setStatus("아이디는 영문/숫자 3글자 이상으로 입력해 주세요.");

    if (password.length < 6) return setStatus("비밀번호는 6글자 이상으로 입력해 주세요.");
    if (classText.trim().length < 1) return setStatus("반을 입력해 주세요.");

    setBusy(true);

    const email = makeLoginEmail(selectedSchool.code, username);
    console.log("EMAIL RAW:", JSON.stringify(email));
    console.log("EMAIL LENGTH:", email.length);

    // 1) 로그인 시도
    const signIn = await supabaseBrowser.auth.signInWithPassword({ email, password });

    // 2) 실패하면 회원가입
    if (signIn.error) {
      const signUp = await supabaseBrowser.auth.signUp({ email, password });

      if (signUp.error) {
        setBusy(false);
        setStatus(`로그인/가입 실패: ${signUp.error.message}`);
        return;
      }

      const u = (await supabaseBrowser.auth.getUser()).data.user;
      if (!u) {
        setBusy(false);
        setStatus("가입 후 사용자 정보를 가져오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
        return;
      }

      try {
        await upsertProfile(u.id, selectedSchool.id, classText);
      } catch (err: any) {
        setBusy(false);
        setStatus(`프로필 저장 실패: ${err?.message ?? "unknown"}`);
        return;
      }

      setBusy(false);
      router.push(`/s/${selectedSchool.code}`);
      return;
    }

    // 3) 로그인 성공
    const u = signIn.data.user;
    if (!u) {
      setBusy(false);
      setStatus("로그인 성공했지만 사용자 정보가 없습니다.");
      return;
    }

    try {
      await upsertProfile(u.id, selectedSchool.id, classText);
    } catch (err: any) {
      setBusy(false);
      setStatus(`프로필 저장 실패: ${err?.message ?? "unknown"}`);
      return;
    }

    setBusy(false);
    router.push(nextPath.startsWith("/") ? nextPath : `/s/${selectedSchool.code}`);
  }

  return (
    <main className="hero">
      <div className="brandWrap" style={{ gap: 14 }}>
        <div className="brand" style={{ fontSize: "min(14vh, 140px)" }}>
          DICE
        </div>

        <div style={{ width: "min(760px, 92vw)", display: "grid", gap: 10 }}>
          <div className="hint" style={{ marginTop: -6 }}>
            학교가 많으면 “학교 검색”에 몇 글자만 입력해서 필터한 뒤 선택하세요.
          </div>

          <input
            className="searchInput"
            placeholder="학교 검색 (예: 부산일과학고)"
            value={schoolQuery}
            onChange={(e) => setSchoolQuery(e.target.value)}
          />

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
              학교를 선택해 주세요 (현재 {schoolsAll.length}개 로드됨 / 필터 {schools.length}개)
            </option>
            {schools.map((s) => (
              <option key={s.id} value={s.id} style={{ color: "#000" }}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            className="searchInput"
            placeholder="아이디(영문/숫자만 권장, 로그인에만 사용)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            className="searchInput"
            placeholder="비밀번호 (6글자 이상)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            className="searchInput"
            placeholder="반 (예: 2-3 또는 3반)"
            value={classText}
            onChange={(e) => setClassText(e.target.value)}
          />

          <button className="searchButton" onClick={doAuth} disabled={busy}>
            {busy ? "..." : "로그인 / 가입"}
          </button>

          <div className="hint">
            로그인하지 않으면 서비스 이용이 불가능합니다. (아이디는 로그인에만 사용, 표시 이름은 학교명)
          </div>

          {status ? <div style={{ color: "#ff5a5f" }}>{status}</div> : null}
        </div>
      </div>
    </main>
  );
}