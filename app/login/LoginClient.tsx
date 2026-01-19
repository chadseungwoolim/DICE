"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type School = { id: number; name: string; code: string };

function makeLoginEmail(schoolCode: string, username: string) {
  const u = username.trim().toLowerCase();
  const cleaned = u.replace(/[^a-z0-9._-]/g, "");
  const sc = String(schoolCode ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const local = (cleaned.length ? cleaned : "user") + "." + (sc.length ? sc : "school");
  return `${local}@example.com`;
}

export default function LoginClient() {
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

  useEffect(() => {
    async function loadSchools() {
      const res = await supabaseBrowser
        .from("schools")
        .select("id, name, code")
        .order("name", { ascending: true })
        .limit(5000);

      if (res.error) {
        setStatus(res.error.message);
        return;
      }
      setSchoolsAll((res.data ?? []) as School[]);
    }
    loadSchools();
  }, []);

  async function doAuth() {
    if (!schoolId) return setStatus("학교를 선택해 주세요.");
    if (username.length < 3) return setStatus("아이디는 3글자 이상");
    if (password.length < 6) return setStatus("비밀번호는 6글자 이상");
    if (!classText.trim()) return setStatus("반을 입력해 주세요.");

    setBusy(true);

    const school = schoolsAll.find((s) => s.id === schoolId);
    if (!school) {
      setBusy(false);
      return setStatus("학교 정보 오류");
    }

    const email = makeLoginEmail(school.code, username);

    const signIn = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      const signUp = await supabaseBrowser.auth.signUp({ email, password });
      if (signUp.error) {
        setBusy(false);
        return setStatus(signUp.error.message);
      }
    }

    setBusy(false);
    router.push(`/s/${school.code}`);
  }

  return (
    <main className="hero">
      <div className="brandWrap" style={{ gap: 12 }}>
        <div className="brand">DICE</div>

        <input
          className="searchInput"
          placeholder="학교 검색"
          value={schoolQuery}
          onChange={(e) => setSchoolQuery(e.target.value)}
        />

        <select
          value={schoolId ?? ""}
          onChange={(e) => setSchoolId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">학교 선택</option>
          {schoolsAll
            .filter((s) => s.name.includes(schoolQuery))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>

        <input
          className="searchInput"
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="searchInput"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="searchInput"
          placeholder="반"
          value={classText}
          onChange={(e) => setClassText(e.target.value)}
        />

        <button className="searchButton" onClick={doAuth} disabled={busy}>
          {busy ? "..." : "로그인 / 가입"}
        </button>

        {status && <div style={{ color: "#ff5a5f" }}>{status}</div>}
      </div>
    </main>
  );
}
