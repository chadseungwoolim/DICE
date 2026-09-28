# Aₖ — low-rank media transfer

사람이 형체를 알아볼 수 있는 최소 정보만 남겨 사진과 영상을 극도로 작게 만들고 링크로 공유하는 시스템.

- **사진**: 브라우저에서 행렬로 변환 → SVD `A = UΣVᵀ` → 상위 k개만 남긴 `Aₖ = UₖΣₖVₖᵀ`의 인수를 양자화해 `.ak` 파일로 저장. 서버에는 이 파일만 올라간다.
- **영상**: 브라우저 MediaRecorder로 해상도, 프레임레이트, 비트레이트, 코덱을 낮춰 재인코딩.
- **공유**: Supabase Storage(`media` 버킷)에 업로드 → `/v/<id>` 링크. 회원가입 없음.
- **실험**: `/experiment` — E1 에카르트-영 정리 검증, E2 특이벡터 교체, E3 용량 대 고양이 판정률(사람 / ResNet-50).

## 구조

```
app/                    Next.js App Router
  page.tsx              COMPRESS (업로드 → 압축)
  share/                SHARE (이 브라우저에서 만든 링크 관리)
  v/[id]/               공유 링크 뷰어
  experiment/           E1, E2, E3
  components/           Compressor, ImageCompressor, VideoCompressor, ShareBox, Chart, FilePick
lib/                    worker 래퍼, 스토리지(REST), 분류기, 통계
public/core.js          Web Worker: SVD(Gram+QL, one-sided Jacobi), .ak 코덱, 실험 계산
public/models/          ResNet-50 (TF.js, float16) — E3 자동 판정 모드에서만 로드
supabase/setup.sql      버킷과 정책 생성 SQL
scripts/test-core.mjs   수치 자체 검증
```

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

1. Supabase SQL Editor에서 `supabase/setup.sql` 실행 (선택: Anonymous sign-ins 활성화 → 링크 삭제 가능).
2. Vercel 프로젝트 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. `main` 브랜치에 push → Vercel 자동 빌드.
