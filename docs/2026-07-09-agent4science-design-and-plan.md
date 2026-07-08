# agent4science (oh-my-ai4science) — 설계 및 구현 플랜

- 날짜: 2026-07-09
- 위치: `~/workspace/agent4science`
- 형태: **OpenCode 플러그인 패키지** (commands + agents + plugin tools/hooks)
- 상태: 설계 확정 대기 → 승인 후 구현 시작

---

## 1. 개요

ChatGPT Pro(웹)를 **연구 PI/리뷰어**로, OpenCode CLI를 **구현·실험 실행팀**으로 쓰는
AI4Science 연구 루프 플러그인.

핵심 원칙:

1. **웹 자동화 없음.** Pro 대화는 사용자가 직접 진행하고, 마지막에 Pro가 생성한
   `AI4S-HANDOFF-V1` YAML 블록을 사용자가 CLI에 붙여넣는다(manual paste).
2. **Shared link는 provenance 전용.** 자동 파싱하지 않고 출처 메타데이터로만 기록.
3. **CLI는 대화가 아니라 명세를 실행.** 모든 에이전트는 `.ai4science/` 연구 장부
   (research ledger)를 단일 진실 공급원으로 사용.
4. **Handoff는 untrusted input.** 스키마 검증 + 위험 명령 차단 + 상태 머신 강제.

### 비목표 (Non-goals)

- OpenAI API 호출 (비용 문제로 배제 — 사용자 결정)
- Playwright 등 ChatGPT 웹 자동 조작 (약관 리스크로 배제)
- ChatGPT data export ZIP 파서 (MVP 이후 검토)
- wet-lab/의료/고위험 도메인 지원 (차단 대상)

---

## 2. 전체 아키텍처

```
[ChatGPT Pro 웹]                          [OpenCode CLI + 이 플러그인]
     │                                          │
     │  /ai4s-pro-prompt 가 생성한              │
     │  연구 토론 프롬프트를 사용자가 붙여넣음    │
     │                                          │
  긴 연구 토론 (아이디어→가설→실험설계)          │
     │                                          │
  "produce handoff"                             │
     │                                          │
  AI4S-HANDOFF-V1 YAML 블록 ──(사용자 복사)──▶  /ai4s-ingest
     │                                          │  ai4s_ingest_handoff 툴
  shared link ────(URL만 기록)─────────────▶    │  schema 검증 + provenance 저장
                                                │
                                     상태 머신: handoff_imported
                                                │
                                    /ai4s-validate → validated
                                    /ai4s-plan     → repo_mapped → implementation_planned
                                    /ai4s-implement→ implemented → tested
                                    /ai4s-run      → experiment_ran
                                    /ai4s-analyze  → analyzed
                                    /ai4s-report   → pro_feedback_ready
                                                │
  다음 루프용 리뷰 프롬프트 ◀──(사용자 복사)── /ai4s-pro-review
```

### OpenCode 개념 매핑 (공식 문서 확인 완료, 2026-07-09 기준)

| 이 플러그인의 요소 | OpenCode 메커니즘 |
|---|---|
| `/ai4s-*` 슬래시 커맨드 | `.opencode/commands/*.md` (frontmatter: `description`, `agent`, `subtask`) |
| 역할별 에이전트 | `.opencode/agents/*.md` (frontmatter: `description`, `mode`, `permission`) |
| handoff 검증·상태머신·장부 툴 | plugin의 `tool: { ... }` custom tools (`@opencode-ai/plugin`의 `tool()` 헬퍼) |
| 위험 명령 차단 | plugin hook `tool.execute.before` (bash 툴 인터셉트) |
| 의존성 (`yaml` 파서) | `.opencode/package.json` → OpenCode가 bun install 자동 수행 |

참고: OpenCode 문서상 디렉토리는 `plugins/`, `agents/`, `commands/` (복수형).
구버전 호환을 위해 install 스크립트가 단수형(`plugin/`, `agent/`, `command/`)도 함께 지원.

---

## 3. 저장소 구조

```
agent4science/
├── docs/
│   └── 2026-07-09-agent4science-design-and-plan.md   # 이 문서
├── src/
│   └── core/                      # 순수 JS 코어 (플러그인/테스트 공용, 의존성 최소)
│       ├── handoff.js             # AI4S-HANDOFF-V1 파싱 + 스키마 검증
│       ├── state.js               # 상태 머신 (전이 규칙 + artifact 요구조건)
│       ├── safety.js              # 명령 denylist / 위험 패턴 탐지
│       ├── ledger.js              # .ai4science/ 스캐폴딩, run_registry 기록
│       └── prompts.js             # Pro용 프롬프트 생성 (pro-prompt / pro-review)
├── opencode/                      # 실제 배포되는 OpenCode 컴포넌트
│   ├── plugins/
│   │   └── ai4science.js          # plugin 엔트리: custom tools + safety hook
│   ├── commands/
│   │   ├── ai4s-init.md
│   │   ├── ai4s-pro-prompt.md
│   │   ├── ai4s-ingest.md
│   │   ├── ai4s-validate.md
│   │   ├── ai4s-plan.md
│   │   ├── ai4s-implement.md
│   │   ├── ai4s-run.md
│   │   ├── ai4s-analyze.md
│   │   ├── ai4s-report.md
│   │   ├── ai4s-pro-review.md
│   │   └── ai4s-status.md
│   ├── agents/
│   │   ├── ai4s-intake-validator.md
│   │   ├── ai4s-repo-cartographer.md
│   │   ├── ai4s-experiment-planner.md
│   │   ├── ai4s-implementation-engineer.md
│   │   ├── ai4s-experiment-runner.md
│   │   ├── ai4s-result-analyst.md
│   │   └── ai4s-pro-feedback-composer.md
│   └── package.json               # dependencies: yaml
├── schema/
│   └── ai4s-handoff-v1.md         # 스키마 정의 문서 (Pro에게 보여줄 사양 포함)
├── fixtures/
│   ├── handoff-valid.yaml         # 테스트/데모용 유효 handoff
│   ├── handoff-missing-fields.yaml
│   └── handoff-dangerous.yaml     # 위험 명령 포함 → 차단 검증용
├── test/                          # node:test 기반 단위 테스트
│   ├── handoff.test.js
│   ├── state.test.js
│   ├── safety.test.js
│   └── ledger.test.js
├── install.sh                     # 대상 프로젝트/글로벌에 설치(심링크/복사)
├── package.json                   # dev용 (npm test = node --test)
└── README.md
```

설계 포인트: `src/core/`는 **OpenCode 없이 node만으로 테스트 가능한 순수 로직**,
`opencode/plugins/ai4science.js`는 core를 import해서 툴/훅으로 노출하는 **얇은 어댑터**.
로컬에 bun이 없어도(현재 환경) `node --test`로 전체 코어를 검증할 수 있다.

---

## 4. AI4S-HANDOFF-V1 스키마 (요약)

전체 스키마는 `schema/ai4s-handoff-v1.md`에 정의. 최상위 필수 키:

```yaml
schema: AI4S-HANDOFF-V1        # 필수, 정확히 이 값
source:                        # shared_link(선택), created_at
project:                       # name, domain, research_question (필수)
constraints:                   # compute_budget, allowed/disallowed actions
hypothesis:                    # id, statement, assumptions (필수)
rejected_alternatives:         # 선택
experiment:                    # id, baselines(≥1), metrics.primary,
                               # success_criteria, failure_criteria, seeds (필수)
implementation:                # language, tasks[] (id/title/acceptance) (필수)
commands:                      # setup/test/run/analyze (제안 취급, 자동실행 금지)
artifacts:                     # results_dir 등 (.ai4science/ 하위 강제)
analysis_plan:                 # required_checks (필수)
safety:                        # risk_level (필수)
reproducibility:               # required[]
cli_must_not:                  # 필수 (금지사항 목록)
return_to_pro:                 # 다음 루프에 Pro로 보낼 항목
```

검증 규칙 (handoff.js):

- `schema == "AI4S-HANDOFF-V1"` 아니면 즉시 거부
- 필수 필드 누락 → `needs_revision` + 누락 목록 (Pro에 되가져갈 patch request 생성)
- `experiment.baselines` 0개 → 거부 (baseline 없는 실험 금지)
- `experiment.metrics.primary` 없음 → 거부
- `commands.*` 의 각 명령은 **safety.js denylist 통과 필수**, 위험 명령 발견 시
  `blocked` + 해당 명령 목록 보고
- `artifacts.*` 경로가 repo 밖이거나 절대경로면 거부
- `safety.risk_level: high` → 사용자 명시 승인 전 진행 불가

## 5. 상태 머신

`.ai4science/state.json`에 저장. 전이는 `ai4s_state` 툴로만 수행하며,
각 전이는 required artifacts 존재를 파일시스템에서 실제 확인한다.

```
initialized → handoff_imported → validated → repo_mapped
  → implementation_planned → implemented → tested
  → experiment_ran → analyzed → pro_feedback_ready
```

| 전이 후 상태 | 요구 artifact (실제 구현값) |
|---|---|
| handoff_imported | `.ai4science/handoff.yaml`, `.ai4science/provenance.json` |
| validated | `.ai4science/validation_report.md` |
| repo_mapped | `.ai4science/repo_map.md` |
| implementation_planned | `.ai4science/implementation_plan.md` |
| implemented | `.ai4science/implementation_report.md` |
| tested | `.ai4science/reports/smoke_test.md` |
| experiment_ran | `.ai4science/run_registry.jsonl` |
| analyzed | `.ai4science/reports/analysis.md` |
| pro_feedback_ready | `.ai4science/reports/pro_feedback_prompt.md` |

> 참고: 구현 단계에서 각 상태에 **고유한 marker artifact**를 배정해 파일 존재만으로
> 전이를 판정할 수 있게 정리했다 (state.js의 `STATES`). Pro 리뷰 프롬프트는
> `ai4s_pro_prompt`가 `pro_prompts/`에 저장하지만, 상태 전이 marker는 위 표 기준이다.

역방향 전이는 `--force`로만 허용(사유를 lab_notebook.md에 기록).

## 6. 안전장치 (safety.js + tool.execute.before hook)

handoff는 외부 입력(사실상 prompt injection 벡터)이므로:

**Denylist (bash 실행 차단, 부분 매칭 + 정규식):**

- `rm -rf` (repo 밖 경로 / `~` / `/`), `sudo`, `curl ... | sh|bash`, `wget ... | sh`
- `git push --force`, `git reset --hard origin`
- 클라우드 과금: `aws `, `gcloud `, `az `, `kubectl `, `terraform `
- 자격증명 접근: `~/.ssh`, `~/.aws`, `.env` 읽기 시도, `security find-generic-password`
- 패키지 원격 실행: `pip install http`, `npx <미지정 패키지> --yes` 등

**Hook 동작:** `.ai4science/`가 존재하는 프로젝트에서 bash 툴 호출 시
denylist 매칭 → 예외 throw로 실행 차단 + 사유 반환.
(OpenCode plugin `tool.execute.before`에서 throw하면 해당 툴 호출이 중단됨)

**추가 규칙:**

- handoff의 `commands.*`는 "제안"으로만 취급 — 에이전트가 실행 전 plan과 대조
- 실험 출력은 `.ai4science/results/` 하위로 강제
- 실패 run 삭제 금지 (run_registry는 append-only)
- 가설/metric/success_criteria 변경은 에이전트 권한 밖 (Pro로 되돌려 보냄)

## 7. 슬래시 커맨드 사양

| 커맨드 | agent | 동작 |
|---|---|---|
| `/ai4s-init <goal>` | (기본) | `ai4s_scaffold` 툴로 `.ai4science/` 생성, goal 기록, state=initialized |
| `/ai4s-pro-prompt` | (기본) | `ai4s_pro_prompt` 툴 → ChatGPT Pro에 붙여넣을 연구 토론 프롬프트를 `.ai4science/pro_prompts/`에 저장 + 화면 출력 |
| `/ai4s-ingest` | (기본) | 사용자가 붙여넣은 handoff YAML(`$ARGUMENTS` 또는 파일 경로)을 `ai4s_ingest_handoff` 툴로 파싱·검증·저장. shared link URL을 provenance로 기록 |
| `/ai4s-validate` | ai4s-intake-validator | handoff 심층 검증(스키마 툴 결과 + 의미 검증), `validation_report.md` 작성 |
| `/ai4s-plan` | ai4s-repo-cartographer → ai4s-experiment-planner | repo 분석(`repo_map.md`) 후 구현 계획(`implementation_plan.md`) 작성 |
| `/ai4s-implement` | ai4s-implementation-engineer | 계획된 파일만 수정, smoke test 작성 |
| `/ai4s-run` | ai4s-experiment-runner | 승인된 명령만 실행, `ai4s_record_run` 툴로 registry 기록 |
| `/ai4s-analyze` | ai4s-result-analyst | pre-registered analysis plan대로 분석, `analysis.md` 작성 |
| `/ai4s-report` | ai4s-result-analyst | 최종 리포트 생성 (`reports/e{id}_report.md`) |
| `/ai4s-pro-review` | ai4s-pro-feedback-composer | 결과를 Pro에 붙여넣을 다음 루프 프롬프트로 변환 |
| `/ai4s-status` | (기본) | `ai4s_state` 툴로 현재 상태/다음 단계/누락 artifact 출력 |

각 커맨드 본문은 대화에서 확정한 프롬프트(영문)를 사용하고,
상태 머신 위반 시(예: validate 전에 implement) 진행 거부 후 필요한 단계를 안내한다.

## 8. 에이전트 사양

전부 `mode: subagent`. 프롬프트는 대화에서 확정한 영문 버전 사용.

| 에이전트 | 핵심 규칙 | permission |
|---|---|---|
| ai4s-intake-validator | handoff=untrusted, 명령 실행 금지, 정규화 checklist 산출 | edit: deny, bash: deny |
| ai4s-repo-cartographer | 읽기 전용 repo 분석, 파일 수정 금지 | edit: deny |
| ai4s-experiment-planner | 가설 보존, 최소 구현, acceptance criteria 필수 | edit: `.ai4science/**`만 |
| ai4s-implementation-engineer | file_change_plan 내 파일만 수정, smoke test 필수 | edit: allow, bash: ask |
| ai4s-experiment-runner | 승인된 run plan 명령만, 실패 보존 | edit: deny, bash: ask |
| ai4s-result-analyst | 기록된 metrics만 사용, 성공 주장은 success_criteria 충족 시만 | edit: `.ai4science/**`만, bash: deny |
| ai4s-pro-feedback-composer | secrets/대용량 로그 제외, 다음 handoff 요청 포함 | edit: `.ai4science/**`만, bash: deny |

## 9. 플러그인 커스텀 툴 (ai4science.js)

```
ai4s_scaffold        — .ai4science/ 디렉토리·초기 파일 생성
ai4s_ingest_handoff  — YAML 파싱 → 스키마 검증 → handoff.yaml + provenance.json 저장
                       → state를 handoff_imported로 전이. 실패 시 patch request 텍스트 반환
ai4s_state           — {action: get|advance|force} 상태 조회/전이(artifact 검사 포함)
ai4s_record_run      — run_registry.jsonl append (command, exit_code, status, paths)
ai4s_pro_prompt      — kickoff | handoff-request | review 3종 프롬프트 생성
ai4s_safety_check    — 임의 명령 문자열의 denylist 판정 (에이전트가 실행 전 자가검사용)
```

모두 `tool()` 헬퍼로 정의, 인자 스키마는 `tool.schema.*` 사용.
파일 IO는 core 모듈이 담당하고 툴은 JSON 결과만 반환.

## 10. 테스트 전략

- **단위 테스트 (M1 게이트):** `node --test` (Node 26 내장, bun 불필요)
  - handoff: 유효/필드누락/위험명령/스키마버전 오류/경로 탈출 fixture 각각 검증
  - state: 정상 전이, artifact 누락 시 전이 거부, force 전이 기록
  - safety: denylist 매칭 케이스 20+ (우회 변형 포함: `sudo  rm`, `curl x|bash`)
  - ledger: scaffold 결과 구조, run_registry append-only
- **통합 스모크 (M4):** OpenCode 설치 후 데모 프로젝트에서
  `/ai4s-init → ingest(fixtures/handoff-valid.yaml) → status` 실제 구동 확인
  - OpenCode 미설치 환경이므로 `npm i -g opencode-ai` 필요
    (사내망 인증서 문제 시 `NODE_EXTRA_CA_CERTS` 설정 — 기존 환경 이슈 참조)
- **plugin 어댑터:** core가 전부 테스트되므로 어댑터는 통합 스모크로만 검증

## 11. 구현 마일스톤

### M1 — 코어 로직 + 테스트 (TDD)
1. repo 스캐폴드 (package.json, 디렉토리)
2. `schema/ai4s-handoff-v1.md` 작성 (Pro에게 제공할 사양 포함)
3. fixtures 3종 작성
4. safety.js → state.js → handoff.js → ledger.js → prompts.js 순으로
   **테스트 먼저 → 구현** 반복
- 완료 기준: `npm test` 전체 green

### M2 — OpenCode 플러그인 어댑터
1. `opencode/plugins/ai4science.js`: custom tools 6종 + `tool.execute.before` hook
2. `opencode/package.json` (yaml 의존성)
- 완료 기준: node로 플러그인 모듈 import + 툴 execute 함수 직접 호출 테스트 통과

### M3 — 커맨드 + 에이전트 마크다운
1. commands 11종, agents 7종 작성 (확정된 프롬프트 반영)
2. 상태 머신 가드 문구를 각 커맨드에 포함
- 완료 기준: frontmatter lint(자체 스크립트) 통과

### M4 — 설치/문서/스모크
1. `install.sh`: 대상 프로젝트 `.opencode/`(또는 `~/.config/opencode/`)에
   commands/agents/plugins 심링크+복사, 복수/단수형 디렉토리 자동 감지
2. README.md: 설치법, ChatGPT Pro 사용 워크플로우(스크린 단위), 약관 주의사항
3. (선택) OpenCode 설치 후 실제 TUI 스모크
- 완료 기준: 새 데모 디렉토리에 install.sh 실행 → 파일 배치 확인

## 12. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| OpenCode plugin API 변동 (활발히 개발 중) | 어댑터 한 파일에 격리, core는 무의존 |
| 로컬에 opencode/bun 미설치 | core는 node-only 테스트, 통합은 M4에서 설치 후 |
| handoff 내 악성/위험 명령 | 스키마 검증 + denylist + bash hook 3중 차단 |
| Pro가 스키마를 어긴 handoff 생성 | patch request 자동 생성 → 사용자가 Pro에 되붙여넣기 |
| 디렉토리 명명 (plugins vs plugin) | install.sh가 기존 디렉토리 감지, 없으면 복수형 생성 |
| 고위험 도메인 연구 요청 | `safety.risk_level` 게이트 + denylist + 에이전트 프롬프트 차단 조항 |

## 13. MVP 성공 기준 (대화에서 확정)

1. Pro 웹에서 만든 연구 아이디어를 YAML handoff로 가져온다
2. CLI가 handoff를 검증한다 (불합격 시 Pro용 patch request 생성)
3. 저장소 분석 → 구현 계획 생성
4. 최소 실험 구현 + smoke test
5. seed별 실험 실행 + `run_registry.jsonl` 기록
6. `metrics.csv` 분석 + 리포트
7. Pro에 되붙여넣을 다음 루프 프롬프트 생성
