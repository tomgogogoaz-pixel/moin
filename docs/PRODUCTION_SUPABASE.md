# Moin 운영 Supabase 연결

로컬 개발은 기존 SQLite와 로컬 업로드 폴더를 그대로 사용한다. Vercel 등 서버리스 운영 환경에서는 아래 두 값을 서버 환경변수로 설정하면 같은 HTTP API가 Supabase Postgres Data API와 비공개 Storage 버킷을 사용한다.

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_server_key
```

레거시 프로젝트는 `SUPABASE_SERVICE_ROLE_KEY`도 사용할 수 있다. 두 키 모두 브라우저 코드나 `public/` 파일에 넣지 않는다.

## 적용 순서

1. Supabase SQL Editor에서 `supabase/migrations/202607310001_moin_initial.sql`을 실행한다.
2. Vercel 프로젝트의 Production/Preview 환경변수에 위 값을 추가한다.
3. 재배포 후 `/api/health`의 `database` 값이 `supabase`인지 확인한다.
4. 회원가입·로그인 후 프로젝트를 생성하고 새로고침해 세션과 프로젝트가 유지되는지 확인한다.
5. 프로젝트의 비공개 미디어 API가 업로드·생성 이미지를 정상적으로 반환하는지 확인한다.

## 보안 경계

- 운영 스키마는 사용자·세션·프로젝트·버전·장바구니·주문 테이블에 RLS를 활성화한다.
- 익명 및 일반 인증 역할의 직접 테이블/함수 접근은 차단한다.
- Node 서버만 secret key로 데이터에 접근하며, 서버가 각 요청의 사용자 소유권을 검사한다.
- 업로드와 생성 이미지는 비공개 `moin-media` 버킷에 저장한다.
- `SUPABASE_SECRET_KEY` 또는 service-role 키는 Git, 응답 JSON, 브라우저 번들에 포함하지 않는다.

## 구현 파일

- `src/supabase-database.js`: Supabase Data API/Storage 어댑터
- `supabase/migrations/202607310001_moin_initial.sql`: 운영 스키마, 권한, 비공개 버킷
- `src/server.js`: 환경변수에 따른 SQLite/Supabase 자동 선택 및 비공개 미디어 전달
