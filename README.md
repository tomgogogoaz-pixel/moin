# 모인 (Moin)

사진 두 장으로 현재 공간과 원하는 분위기를 비교하고, AI 시뮬레이션·예상 견적·자재 구매까지 이어 주는 반응형 DIY 인테리어 서비스 MVP입니다. 폴더의 PRD 5개와 와이어 이미지 23개를 분석해 최신 로그인 포함 PRD의 기능 흐름과 `PRD 명세서 작성.pdf`의 화면 구성을 우선 적용했습니다.

## 바로 실행하기

요구 사항은 **Node.js 24 이상**입니다. 별도 npm 패키지는 사용하지 않으며 SQLite는 Node의 `node:sqlite`를 사용합니다.

```powershell
Copy-Item .env.example .env
npm start
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다.

- 데모 로그인: `demo@moin.local` / `moin1234!`
- 또는 회원가입 후 새 계정으로 로그인할 수 있습니다.
- 최초 실행 시 `data/moin.sqlite`가, 첫 이미지 분석 시 `data/uploads`와 `data/generated`가 자동 생성됩니다.

## 구현된 사용자 흐름

1. 랜딩 페이지에서 시작
2. 회원가입·로그인 또는 데모 로그인
3. 대시보드에서 자재와 도구 확인
4. 현재 공간과 참고 인테리어 이미지 2장 업로드
5. AI 분석 결과, 전후 비교 슬라이더, 상세 견적과 절감률 확인
6. 결과 저장 또는 브라우저 인쇄 기능으로 PDF 저장
7. 자재 검색·분류·가격 필터, 장바구니, 견적서, 데모 결제

주요 화면 경로는 `/`, `/login`, `/signup`, `/dashboard`, `/reports/:id`, `/market`, `/projects`, `/estimate`, `/mypage`입니다. 데스크톱과 모바일 레이아웃은 각각 1440×900, 390×844 환경에서 검수했습니다.

## 현재 동작 범위

- 로컬 AI 기본값은 `mock`입니다. 결과 화면과 데이터 저장 흐름을 API 키 없이 끝까지 시험할 수 있습니다.
- 주문은 실제 결제 대신 `demo_completed` 상태를 저장하는 데모 결제입니다.
- Google·Kakao·Apple 로그인 버튼은 화면 명세를 위한 UI이며 실제 OAuth 연결 전입니다.
- 견적 표와 게이지는 `project.analysis.estimate`를 실제로 렌더링합니다. mock의 숫자와 92% 절감 표시는 제공된 PRD 데모 값을 보존하므로, 실제 서비스에서는 면적·수량·시세 기반 산정 규칙으로 교체해야 합니다.

## Gemini / Nano Banana 연결

API 키는 브라우저로 전달되지 않고 서버의 `.env`에서만 읽습니다. 모델명은 출시·계정 상황에 맞게 나중에 지정할 수 있도록 하드코딩하지 않았습니다.

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your_server_side_key
GEMINI_TEXT_MODEL=your_gemini_text_model
GEMINI_IMAGE_MODEL=your_gemini_image_model
```

세 값과 키가 모두 있을 때만 Gemini 공급자가 활성화됩니다. 텍스트 모델은 구조화된 공간 분석 JSON을, 이미지 모델은 두 업로드를 참고한 완성 공간 이미지를 생성합니다. 호출에는 60초 timeout, 제한 재시도, 응답 필드·추천 slug·이미지 형식/크기 검증을 적용했습니다. 설정이 빠지면 안전하게 mock 공급자를 사용합니다. 공급자 경계는 `src/services/ai.js`에 모여 있습니다.

## 데이터와 보안

SQLite 스키마는 사용자, 해시 세션, 프로젝트, 자재, 장바구니, 주문, 주문 항목으로 구성됩니다.

- 비밀번호: 무작위 salt를 포함한 `scrypt` 해시
- 세션: 원문을 DB에 두지 않는 SHA-256 토큰 해시, `HttpOnly`, `SameSite=Lax`, 운영 환경 `Secure` 쿠키
- 회원가입: 필수 약관 동의 시각과 약관 버전 저장
- 업로드: PNG/JPEG/WebP, 파일 시그니처 확인, 이미지당 최대 8MB, Base64 변환을 고려한 요청 본문 최대 24MB
- 프로젝트 미디어: 소유 사용자만 접근하는 인증 API로 제공
- AI 분석: 사용자별 기본 시간당 20회 제한; 운영 환경의 데모 로그인은 명시적으로 허용하지 않으면 차단
- 기본 CSP, 프레임 차단, MIME 스니핑 차단, 권한 정책 헤더 적용
- 금액: 부동소수점 오차를 피하도록 원 단위 정수 저장

로컬 데이터와 업로드는 `.gitignore` 처리되어 있습니다. AI 실패 시 해당 요청의 업로드는 정리하지만 성공 프로젝트는 사용자가 다시 볼 수 있도록 보관하며, 현재 삭제 API와 자동 보존 기한은 없습니다. 운영 배포 전에는 프로젝트 삭제·보존 정책, IP 단위 속도 제한, CSRF 정책, 완전한 이미지 디코딩/악성 파일 검사, 비밀 관리 서비스를 추가하세요.

## Supabase로 이전할 때

현재 HTTP API 계약과 UI는 유지할 수 있지만, SQL이 `src/server.js`에도 직접 사용되므로 먼저 사용자·프로젝트·카트·주문 쿼리를 비동기 repository 계층으로 분리한 뒤 SQLite 구현을 Supabase 구현으로 교체해야 합니다.

- `users`·`sessions` → Supabase Auth
- 나머지 테이블 → Postgres 및 Row Level Security
- `data/uploads`, `data/generated` → 비공개 Storage 버킷과 signed URL
- 서버 전용 Service Role 키는 절대 프런트엔드에 포함하지 않기

`.env.example`에는 향후 어댑터를 위한 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 자리만 마련되어 있습니다.

## 프로젝트 구조

```text
public/                 반응형 SPA, 스타일, 로컬 WebP 자산
src/server.js           Node HTTP 서버, 인증/API/정적 파일 제공
src/database.js         SQLite 스키마와 데모 시드
src/security.js         비밀번호·세션 보안 유틸리티
src/services/ai.js      mock 및 Gemini 공급자
scripts/                공개 자재 이미지 변환 스크립트
tests/                  보안 및 API 통합 테스트
docs/PRODUCT_DESIGN.md  분석 근거, 화면·런타임·이전 설계
tmp/pdfs/               PDF 추출·렌더링·통합 분석 결과
```

자재 이미지는 Wikimedia Commons 원본을 로컬 WebP로 변환했으며 출처, 라이선스, 변형 내용은 `public/assets/materials/SOURCES.md`에 기록했습니다. 랜딩과 전후 공간 이미지는 제공된 와이어 구도를 참고해 이 프로토타입용으로 생성했습니다.

## 확인 명령

```powershell
npm test
node --check src/server.js
node --check public/app.js
```

18개 자동 테스트는 인증, 세션, 운영 환경 데모 차단, 잘못된 쿠키/JSON, 상품 목록, 장바구니 수량 경계와 부분 수정, 최대 크기 이미지 2장, 구조화된 413 응답, 프로젝트 소유권 미디어, 저장, 데모 주문, 로그아웃, AI 설정 fail-fast와 보안 유틸리티를 포함합니다.
