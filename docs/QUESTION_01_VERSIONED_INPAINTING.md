# [1번 질문] 버전 관리형 인테리어 인페인팅 명세

## 보관 범위

이 문서는 사용자가 요청한 **[1번 질문]**의 기준 사양을 보관하는 저장소 내 기준 문서다. 대화형 AI가 이 내용을 자동으로 기억한다는 뜻은 아니며, 서비스와 개발자는 이 파일 및 프로젝트에 저장된 버전 이력을 기준으로 내용을 다시 불러온다.

목표는 원본 공간 스케치/사진을 안전한 기준점으로 보존하고, 자재를 적용한 여러 결과를 서로 독립된 버전으로 저장·비교·복원하는 것이다.

## 핵심 원칙

1. **원본 구조 잠금** — 최초 업로드한 원본 공간 이미지(`baseSource`)는 카메라 앵글, 원근, 크롭, 창문·벽·가구·소품의 배치를 판단하는 불변 기준점이다. 원본 파일은 생성 결과로 덮어쓰지 않는다.
2. **비파괴 버전 관리** — 한 번 생성되거나 복원된 결과는 새 버전으로 저장한다. ‘롤백’은 파일을 지우거나 AI에게 이전 화면을 기억해 달라고 요청하는 작업이 아니라, 선택한 스냅샷을 반영한 `rollback` 버전을 추가하고 현재 프로젝트 표시값을 갱신하는 작업이다.
3. **명시적 재생성 기준** — 새 자재 적용은 언제나 프로젝트의 불변 원본 스케치/사진에서 다시 시작한다. 이전 생성 결과나 롤백 결과를 다음 생성의 구조 입력으로 재사용하지 않는다.
4. **객체 단위 보호** — 객체 재질 변경은 원본, 이진 마스크, 자재 스와치의 A/B/C 입력 계약을 따른다. 흰색 마스크 내부만 생성 대상으로 삼고, 운영 환경에서는 서버 하드 마스크 합성으로 마스크 밖 원본 픽셀을 보존한다.
5. **모델 메모리 금지** — 생성 모델은 프로젝트 이력의 저장소가 아니다. 매 요청에 서버가 선택한 기준 이미지·마스크·자재·프롬프트 버전을 다시 제공하며, 모델 응답만으로 롤백 상태를 판정하지 않는다.

## 사용자 흐름

1. 사용자가 원본 공간 사진/스케치를 올리면 시스템은 변경 불가능한 `baseline` 버전을 만든다.
2. 사용자가 바닥재·벽지 또는 참고 이미지를 적용하면 서버는 부모 버전을 참조하는 `generation` 버전을 새로 만든다.
3. 결과 리포트에서 이전 스케치로 돌아가기를 누르면 `POST /api/v1/projects/:projectId/rollback`이 원본 `baseline`을 대상으로 한 `rollback` 스냅샷을 추가하고, 프로젝트의 현재 표시값을 원본으로 되돌린다.
4. 사용자는 특정 완료 버전을 지정해 그 결과로도 복원할 수 있다. 이후 새 분석은 선택한 결과가 아니라 불변 원본 공간 이미지에서 다시 시작한다. 기존 결과와 입력 파일은 삭제되지 않는다.

## 권장 서버 데이터 모델

프로젝트의 현재 화면 투영값(`result_after_path` 등)은 유지하되, 모든 기준·생성·롤백 상태는 별도의 `project_versions` 레코드에도 스냅샷으로 남긴다.

| 필드 | 의미 |
| --- | --- |
| `id`, `project_id` | 버전과 소유 프로젝트 식별자 |
| `version_number`, `parent_version_id` | 프로젝트 안의 순번과 이 버전의 부모. 원본 `baseline`의 부모는 `null` |
| `kind`, `status` | `baseline`, `generation`, `rollback` 및 `completed`/`failed` 상태 |
| `before_image_path`, `result_after_path` | 구조 기준 원본과 결과의 비공개 미디어 경로 |
| `reference_image_path`, `floor_material_image_path`, `wall_material_image_path` | 재생성에 필요한 참고·자재 입력 스냅샷 |
| `object_material_image_path`, `object_mask_image_path`, `analysis_json` | 객체 재질 기능의 입력과 프롬프트·분석 감사 메타데이터 |
| `created_at` | 생성 시각 |

현재 SQLite 구현은 프로젝트에 `active_version_id`를 따로 저장하지 않는다. `GET /versions`는 가장 최근의 `completed` 버전을 활성 버전으로 계산하고, `projects` 행은 그 최신 완료 버전의 표시용 투영값을 가진다. 롤백도 기존 스냅샷을 바꾸지 않고 새 `rollback` 버전을 추가하므로, 기존 버전·미디어는 보존된다.

## API 계약

아래는 버전 기능의 서버 계약이다. 모든 엔드포인트는 인증된 프로젝트 소유자만 사용할 수 있으며, 다른 사용자의 버전 ID는 존재 여부와 관계없이 접근할 수 없어야 한다.

### `GET /api/v1/projects/:projectId/versions`

프로젝트의 비파괴 버전 목록, `baselineVersionId`, 계산된 `activeVersionId`를 반환한다. 각 항목은 ID, 순번, 부모 ID, 종류, 상태, 생성 시각, 활성 여부, 입력 모드, 대상 객체, 요약만 포함한다. 원본 Base64·비공개 파일 경로·미디어 URL은 이 목록에 포함하지 않는다.

### `POST /api/v1/projects/:projectId/versions/analyze`

불변 원본 공간 이미지에서 새 결과 버전을 만든다. 이 API는 기존 결과 버전을 기준 이미지로 받지 않는다.

```json
{
  "referenceImage": "data:image/...;base64,..."
}
```

- 참고 이미지 방식은 `referenceImage` 하나를 받는다. 바닥·벽 방식은 `floorMaterialImage`와 `wallMaterialImage`를 함께 받으며, 둘 중 하나만 보내면 거부된다.
- 서버는 언제나 프로젝트 최초 원본 이미지(`current_image_path`)를 Input A 구조 기준으로 사용한다. 요청 자재·참고 이미지는 새 입력 스냅샷으로 저장한다.
- 성공 시 `generation` 버전을 추가하고 프로젝트의 현재 표시 투영값을 갱신한다. 실패한 분석도 `failed` 버전으로 기록된다.

### `POST /api/v1/projects/:projectId/rollback`

본문의 `versionId`를 복원 대상으로 사용한다. 본문을 비우거나 `versionId`를 생략하면 원본 `baseline`으로 복원한다.

```json
{ "versionId": "restore-target-version-id" }
```

이 작업은 이미지 생성 호출을 하지 않으며, 기존 결과를 덮어쓰거나 삭제하지 않는다. 서버는 대상 스냅샷의 결과·입력 메타데이터를 프로젝트 표시 투영값에 반영한 뒤, 해당 복원 행위를 나타내는 새 `rollback` 버전을 추가한다. 따라서 가장 최근의 완료 버전이 새 활성 버전이 된다.

## AI 시스템 지시문

```text
Role: Professional AI Interior Design Image Synthesis Engine with Version Control.

The server, not the model, owns version history. For a versioned regeneration,
Input A is always the immutable original source image for the project; do not
infer or remember prior versions.
Preserve Input A's camera, perspective, crop, architecture, windows, furniture,
object placement, scale, occlusion, and structural lines.

For floor/wall material transfer, apply the provided swatches only to their
declared surfaces. For object-aware transfer, Input B is the binary mask and
Input C is the material swatch: modify only the white/opaque region of Input B.
Respect existing lighting direction, highlights, contact shadows, curvature, and
material scale. Do not add, remove, move, resize, or restage furniture or decor.

Do not create split screens, captions, labels, logos, watermarks, dashboards,
or DIY value gauges. Return one full-frame result aligned with Input A.
```

## 현재 구현 시 유의사항

- 이 명세가 곧 모델의 장기 기억이나 자동 SAM 객체 분할을 의미하지는 않는다. 현재 로컬 환경에서 SAM 등 자동 세그멘테이션 런타임이 없으면 사용자가 확정한 수동 PNG 마스크를 사용한다.
- 프롬프트만으로 마스크 바깥 픽셀 보존을 보장할 수 없다. 실제 운영에서는 `final = mask ? generated : source` 규칙의 서버 측 하드 마스크 합성을 적용해야 한다.
- SQLite MVP는 `project_versions` 이력과 버전 조회·롤백·재분석 API를 제공한다. 자동 SAM 객체 분할과 서버 하드 마스크 합성은 별도 운영 고도화 항목이며, 현재 로컬 환경의 수동 PNG 마스크 계약과 구분한다.
