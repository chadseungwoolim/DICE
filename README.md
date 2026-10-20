# Aₖ — 번호로 주고받는 초저용량 사진과 영상

사람이 형체를 알아볼 수 있는 최소 정보만 남겨 사진과 영상을 극도로 작게 만들고, 받는 사람의 번호로 보내는 시스템.

- **계정**: 사용자가 고른 번호(숫자 4~8자리) + 비밀번호. 이메일, 전화번호 없음. 비밀번호는 DB에서 bcrypt로 저장, 5회 틀리면 15분 잠금.
- **사진**: 브라우저에서 384px로 줄인 뒤 SVD `A = UΣVᵀ` → `Aₖ = UₖΣₖVₖᵀ` (k = 16, 색 채널 k = 4, 5비트)의 인수만 `.ak`로 저장. 약 4~5 KB.
- **영상**: 192px, 4~8 fps, 최대 16초. 프레임을 열로 쌓은 행렬의 시간축 SVD(평균 프레임 + 모드 8개)를 구하고, 각 공간 모드를 다시 2D rank-k SVD로 저장하는 `.akv` 형식. 5초 영상 약 10~12 KB. 소리는 보내지 않음.
- **보내기**: 비공개 버킷 `ak`에 `<보낸 계정>/<무작위>.ak|akv`로 올리고 `ak_send` RPC로 메시지를 만든다. 파일은 보낸 사람과 받는 사람만 내려받을 수 있다(Storage RLS).
- **받은함/보낸함**: 15초마다 새로고침, 열면 읽음 처리, 삭제(양쪽 모두), 차단, 저장(사진 PNG).
- **실험실(숨김)**: 로고를 3초 안에 5번 누르면 Compress / Share / Experiment 메뉴가 나타난다(기기별 기억, 다시 5번 누르면 숨김). 주소로 직접 들어가는 것은 막지 않는다.
  - Compress `/compress`: 기존 수동 압축(k, 비트, 크기 조절), 공개 링크 공유
  - Share `/share`, `/v/<id>`: 기존 공개 링크(`media` 버킷)
  - Experiment `/experiment`: E1 에카르트-영 정리 검증, E2 특이벡터 교체, E3 용량 대 고양이 판정률

## 구조

```
app/
  page.tsx                  홈: 로그인/번호 만들기 → 보내기 + 받은함
  components/home/          Home, AuthGate, Compose, Inbox(뷰어 포함), Settings, AccountChip, PixelView
  components/Brand.tsx      로고 (비밀 5회 탭)
  compress/                 실험실: 수동 압축
  share/, v/                실험실: 공개 링크
  experiment/               실험실: E1, E2, E3
lib/
  supa.ts, account.ts       Supabase 클라이언트, 번호 계정과 메시지 RPC
  media.ts, video.ts        파일 → .ak/.akv, 영상 프레임 추출
  lab.ts, back.ts           숨김 메뉴, 안드로이드 뒤로가기
public/core.js              Web Worker: SVD, .ak/.akv 코덱, 실험 계산
supabase/setup.sql          v1 공개 버킷 media (실험실 Share)
supabase/setup-v2.sql       v2 번호 계정, 메시지, 차단, 비공개 버킷 ak
scripts/test-core.mjs       수치 자체 검증 (SVD, 에카르트-영, .ak, .akv)
```

## Supabase 설정 (v2)

1. SQL Editor에서 `supabase/setup-v2.sql` 실행 (다시 실행해도 안전).
2. Authentication → Sign In / Providers → **Allow anonymous sign-ins** 켜기. 기기마다 익명 세션을 만들고, 번호와 비밀번호로 로그인하면 그 세션을 계정에 연결하는 방식.
3. 무료 플랜은 오래 쓰지 않으면 프로젝트가 일시정지된다. 정지되면 대시보드에서 Restore.

## .akv 형식 (v1)

헤더 16바이트: `'A' 'V'`, version, flags(bit0 deflate-raw), width u16, height u16, 프레임 수 u16, fps×100 u16, 채널 수, bits, tbits.
채널마다: 모드 수 r, 평균 프레임 블록, r × (공간 모드 블록, 시간 계수 스텝 f16, T바이트). 블록은 .ak 채널과 같은 구조(rows, cols, k, 스텝, √σu, √σv).
복원: `frame_t = mean + Σⱼ cⱼ(t) imgⱼ`.

## .ak 형식 (v1)

헤더 12바이트: `'A' 'K'`, version, flags(bit0 deflate-raw, bit1 delta), width u16, height u16, 채널 수(1 = Y, 3 = Y + Cb + Cr 1/2 해상도), bits.
채널마다 rows, cols, k, k개의 양자화 스텝(f16 × 2), 이어서 `√σᵢuᵢ`, `√σᵢvᵢ`를 bits 비트 정수로 양자화한 zigzag 차분 바이트.

## 실행

```bash
npm install
cp .env.example .env.local   # Supabase URL / anon key 입력
npm run dev                  # http://localhost:3000
npm run test:core            # SVD / 코덱 수치 검증
npm run build && npm start
```

## 배포 (Vercel)

1. Supabase SQL Editor에서 `supabase/setup.sql`(실험실 공개 링크)과 `supabase/setup-v2.sql`(번호 보내기) 실행, Anonymous sign-ins 활성화.
2. Vercel 프로젝트 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. `main` 브랜치에 push → Vercel 자동 빌드.

## Android 앱 (Capacitor)

웹과 같은 코드를 정적 번들(`output: "export"`)로 빌드해 APK 안에 넣는다. 서버가 없으므로 공유 뷰어는 `/v/?id=<id>` 쿼리 경로를 쓰고(`app/v/page.tsx`), 동적 라우트 `app/v/[id]`는 앱 빌드 동안만 `scripts/build-app.mjs`가 잠시 치운다. 웹 빌드(Vercel)는 영향 없음.

- 앱 안에서 만든 공유 링크의 도메인은 `NEXT_PUBLIC_WEB_URL`(배포된 웹 주소)을 쓴다. 앱 origin이 `https://localhost`라서 필수.
- ResNet-50 가중치(51MB)는 APK에 넣지 않고 웹 주소에서 받는다(`/models/*`에 CORS 헤더 설정됨). 따라서 E3 자동 판정만 인터넷이 필요.
- 파일 저장은 WebView가 blob 다운로드를 처리하지 못하므로 앱에서는 캐시에 쓴 뒤 시스템 공유창(파일에 저장, 드라이브 등)을 연다.

```bash
# 1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_WEB_URL 설정
npm install
npm run app:sync     # 정적 빌드 → out/ → android/ 로 복사
npm run app:open     # Android Studio 열기
```

Android Studio에서 Gradle Sync 후 기기 또는 에뮬레이터로 Run. APK 파일은 Build > Build Bundle(s) / APK(s) > Build APK(s). 요구 사항: Android Studio 최신판(JDK 21 포함), Node 22 이상(Capacitor 8).
앱 ID는 `com.chadseungwoolim.ak`(`capacitor.config.json`, `android/app/build.gradle`). 스토어에 올린 뒤에는 바꿀 수 없다.
