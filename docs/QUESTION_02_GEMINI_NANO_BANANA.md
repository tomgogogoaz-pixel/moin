# 2번질문 — Gemini / Nano Banana 연결 기준점

작성일: 2026-07-27 (Asia/Seoul)

## 이 복원 지점의 상태

- Moin은 로컬 `http://127.0.0.1:8000`에서 실행한다.
- AI 공급자는 Gemini이며, 텍스트 분석은 `gemini-3.5-flash`, 이미지 생성은 Nano Banana인 `gemini-2.5-flash-image`로 설정한다.
- API 키는 추적하지 않는 로컬 `.env`에만 보관한다. 이 문서와 복원 지점에는 키를 포함하지 않는다.
- 이미지 생성 요청은 실제 Gemini API까지 연결되지만, 이 기준점에서는 Google 쪽 이미지 생성 할당량 부족(HTTP 429)으로 결과 생성이 차단될 수 있다.
- 이 경우 API는 `GEMINI_QUOTA_EXCEEDED`와 한국어 결제·할당량 안내를 반환하고, 화면은 해당 내용을 토스트로 보여준다.
- 최신 Gemini 이미지 API의 호환 요청 형식은 `responseModalities: ['IMAGE']`만 전송하며, 사용되지 않는 `responseFormat`은 보내지 않는다.
- 자동 테스트 기준: 37개 통과.

## 복원 범위

`question-02` 태그는 Moin 앱 소스, 정적 자산, 테스트, 문서, 패키지 설정을 복원한다.

- 포함: `src/`, `public/`, `tests/`, `docs/`, `scripts/`, `package.json`, `README.md`, `.env.example`
- 제외: 실제 API 키가 든 `.env`, 사용자 프로젝트·업로드·SQLite 데이터가 든 `data/`, 로그, 의존성 폴더

제외 항목은 비밀 정보와 사용자의 이후 프로젝트 데이터를 보호하기 위한 것이다. 이후 사용자가 “2번질문으로 돌아가줘”라고 요청하면 위 범위의 앱 코드만 이 기준점으로 되돌린다.
