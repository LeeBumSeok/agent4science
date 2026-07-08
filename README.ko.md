# oh-my-ai4science

[English](README.md) | **한국어**

**ChatGPT Pro(웹)** 연구 대화를 **재현 가능한 CLI 기반 실험**으로 바꿔주는
[OpenCode](https://opencode.ai) 플러그인입니다.

ChatGPT Pro를 연구 PI로 씁니다 — 아이디어를 브레인스토밍하고, 가설을 다듬고, 실험을
설계하죠. 그다음 연구 내용을 OpenCode로 가져오는 방법은 두 가지입니다: **공유된 대화 전체를
가져오거나**(`/ai4s-import-conversation <share-url>`), 압축된 `AI4S-HANDOFF-V1` 블록을
붙여넣거나(`/ai4s-ingest`). 이후는 플러그인이 알아서 진행합니다: validate → plan →
implement → run → analyze → report → 그리고 Pro에게 넘길 다음 반복용 프롬프트 생성까지.

API는 쓰지 않습니다. 유일한 네트워크 호출은 당신이 명시적으로 제공한 **공개 공유 페이지를
한 번 가져오는 것**뿐이며, 링크는 출처(provenance) URL로만 저장됩니다. 아래
[공유에 관한 주의](#chatgpt-공유에-관한-주의)를 참고하세요.

`ai4science` 기본(primary) 에이전트가 OpenCode TUI에서 보이고 선택하는 대상이며, 전문
서브에이전트들에게 작업을 위임합니다.

## 왜 이런 구조인가

- **ChatGPT Pro 웹** = 깊은 연구 판단(참신성, 실험 설계, 해석).
- **OpenCode CLI** = 구현, 실험, 분석, 재현성.
- **`AI4S-HANDOFF-V1` 블록** = 둘 사이의 단일 실행 계약. CLI는 자유 형식의 대화가 아니라
  *명세(spec)*를 실행합니다.
- **`.ai4science/` 장부(ledger)** = 단일 진실 공급원: 상태, handoff, provenance, 실행
  기록(run registry), 리포트.

## 설치

[OpenCode](https://opencode.ai)가 필요합니다. 한 번의 명령, 수동 작업 없음:

```bash
# 이 저장소에서
./install.sh --global                          # ~/.config/opencode — 모든 프로젝트에서 사용
./install.sh /path/to/your/research/project    # 해당 프로젝트의 .opencode/ 에만

# 또는 npm bin으로 (동일 효과), oh-my-openagent 설치기처럼
npx agent4science install --global
```

이게 "등록"의 전부입니다 — OpenCode는 설정 디렉토리에 놓인 모든 것을 **자동 로드**하므로
편집할 `opencode.json`이 없습니다. 설치기는:

- 플러그인(코어 라이브러리는 형제 디렉토리 `.opencode/ai4s-core/`로), `/ai4s-*` 커맨드,
  에이전트(`ai4science` primary + `@ai4s-*` 서브에이전트)를 복사하고;
- **`yaml` 의존성을 자동 조달**(vendor 또는 `bun`/`npm install`)하여 handoff 파싱이 설정
  없이 바로 동작하게 하며;
- 기존 단수/복수 디렉토리 이름을 감지해 기본은 복수형을 씁니다(`--singular`로 `plugin/
  command/ agent/` 강제).

설치 후 OpenCode가 실행 중이었다면 재시작하세요. `ai4science` 에이전트가 TUI 에이전트
전환기(Tab)에 나타나고 `/ai4s-*` 커맨드가 준비됩니다.

## 워크플로우

```
/ai4s-init <goal>          .ai4science/ 장부 초기화.
/ai4s-pro-prompt           ChatGPT Pro 연구 토론 프롬프트 생성 → Pro에 붙여넣기.
   (ChatGPT Pro에서 토론: 질문 명료화, 가설, 최소 실험)

   그다음 아래 둘 중 한 경로로 연구를 가져오기:
   A) 전체 대화 (권장):
      /ai4s-import-conversation <share-url>   공유 대화 전체를 fetch + 디코딩.
   B) 압축 handoff:
      /ai4s-handoff-request                   "produce handoff" 지시문 받기 → Pro에 붙여넣기.
      /ai4s-ingest <block>                    AI4S-HANDOFF-V1 블록 검증 + 저장.

/ai4s-validate             심층 검증. 압축 handoff면 그걸 검증하고, 전체 대화면 트랜스크립트
                           에서 구조화된 handoff.yaml을 도출(구체적 실험이 없으면 정직하게 보고).
/ai4s-plan                 저장소 매핑 + 구현 계획 (서브에이전트 2개)
/ai4s-implement            계획 구현 + 스모크 테스트
/ai4s-run                  스모크 테스트 후 seed별 실험; 모든 실행 기록
/ai4s-analyze              사전 등록된 계획 대비 분석 → analysis.md
/ai4s-report               연구 리포트 작성
/ai4s-pro-review           다음 반복용 프롬프트 생성 → Pro에 붙여넣고, 루프
/ai4s-status               현재 상태, 다음 단계, 누락 artifact 표시
```

`/ai4s-status`가 언제든 현재 위치를 알려줍니다.

## 상태 머신

파이프라인은 한 번에 한 단계씩 진행되며, 각 전진 전이는 이전 단계의 artifact가 디스크에
존재해야 합니다:

```
initialized → handoff_imported → validated → repo_mapped
  → implementation_planned → implemented → tested
  → experiment_ran → analyzed → pro_feedback_ready
```

커맨드는 순서를 벗어나면 실행을 거부하고 먼저 실행할 커맨드를 알려줍니다.

## 연구를 가져오는 두 가지 방법

- **전체 대화 (`/ai4s-import-conversation <share-url>`)** — 공개 ChatGPT 공유 페이지를
  (당신의 명시적 요청으로) 한 번 fetch하고, 임베드된 트랜스크립트를 디코딩해 대화 전체를
  `.ai4science/pro_conversation.md`에 저장합니다. 대화 전체가 연구 컨텍스트가 되고,
  `/ai4s-validate`가 거기서 구조화된 `handoff.yaml`을 도출합니다. 공유 링크는 provenance
  URL로만 저장됩니다. (fetch는 브라우저 user-agent를 쓰고 우아하게 폴백합니다. `backend-api`
  엔드포인트는 봇 차단되지만 공개 공유 HTML은 파싱 가능합니다.)
- **압축 handoff (`/ai4s-ingest <block>`)** — Pro가 만든 `AI4S-HANDOFF-V1` 블록을 직접
  붙여넣습니다. 더 작지만 손으로 복사해야 합니다.

둘 다 동일한 하위 파이프라인(validate → plan → implement → run → analyze)으로 수렴합니다.

## handoff 계약

`AI4S-HANDOFF-V1`은 하나의 YAML 블록입니다. ChatGPT Pro에게 보여줄 것과 동일한 전체 명세는
[`schema/ai4s-handoff-v1.md`](schema/ai4s-handoff-v1.md)에 완전한 예시와 함께 있습니다.
필수 최상위 요소: `project`, `hypothesis`, `experiment`(baseline 최소 1개, primary metric,
success/failure 기준, seeds 포함), `implementation.tasks`, `analysis_plan`,
`safety.risk_level`, `cli_must_not`.

## 안전장치

handoff는 **신뢰할 수 없는 입력**입니다. 세 겹으로 실행을 방어합니다:

1. **스키마 검증** — 필수 필드 누락 → `needs_revision` + ChatGPT Pro에 되붙여넣을 patch
   request. 잘못된 스키마 id, 위험 명령, `.ai4science/`를 벗어나는 artifact 경로 →
   `blocked`(아무것도 저장 안 함).
2. **명령 denylist** — handoff가 제안하는 모든 명령과, ai4science 프로젝트 안의 모든 `bash`
   호출을 검사합니다. 재귀 강제 삭제, `sudo`, 원격 콘텐츠를 셸로 파이프, force push,
   클라우드/인프라 CLI, 자격증명 접근 등을 거부합니다. `tool.execute.before` 훅이 런타임에
   강제하고, 에이전트도 `ai4s_safety_check` 툴로 자가 검사합니다.
3. **상태 머신 + append-only 레지스트리** — 단계는 순서대로 실행되고, 실패한 실행은 절대
   삭제되지 않으며, 가설·metric·success 기준은 임의로 변경되지 않습니다.

고위험 도메인(`safety.risk_level: high`)은 파이프라인이 검증을 넘어 진행하기 전에 당신의
명시적 승인을 요구합니다.

## 에이전트

`ai4science`는 **primary** 에이전트로 OpenCode TUI 에이전트 전환기(Tab)에 보이며 전체
파이프라인을 몰고, 아래 전문 **서브에이전트**들에게 위임합니다. 서브에이전트는 설계상 primary
전환기에 나타나지 않습니다. `@ai4s-...`로 멘션하거나 `/ai4s-*` 커맨드가 자동 위임합니다.

| 에이전트 | 모드 | 역할 |
|---|---|---|
| `ai4science` | primary | PI 오케스트레이터 — TUI에 보이고 파이프라인을 몲 |
| `@ai4s-intake-validator` | subagent | handoff를 신뢰할 수 없는 입력으로 검증 |
| `@ai4s-repo-cartographer` | subagent | 실험이 놓일 위치를 읽기 전용으로 조사 |
| `@ai4s-experiment-planner` | subagent | handoff + 저장소 맵 → 최소 계획으로 변환 |
| `@ai4s-implementation-engineer` | subagent | 계획을 충실히 구현, 스모크 테스트 포함 |
| `@ai4s-experiment-runner` | subagent | 승인된 명령만 실행, 모든 실행 기록 |
| `@ai4s-result-analyst` | subagent | 사전 등록 계획 대비 분석, 리포트 작성 |
| `@ai4s-pro-feedback-composer` | subagent | 다음 반복용 ChatGPT Pro 프롬프트 생성 |

## 개발

코어 로직은 `src/core/` 아래의 순수 JavaScript이며, Node 내장 러너로 테스트합니다(OpenCode나
bun 불필요):

```bash
npm test                    # node --test — 코어 + 어댑터 68개 테스트
npm run lint:frontmatter    # 모든 command/agent 마크다운 파일 검증
```

구성:

- `src/core/` — `safety`, `state`, `handoff`, `conversation`, `ledger`, `prompts`, `actions`
  (순수/테스트 가능); `install.sh`가 이것들을 `.opencode/ai4s-core/`로 복사
- `opencode/plugins/ai4science.js` — 얇은 어댑터: 커스텀 툴 + 안전 훅
  (`../ai4s-core/actions.js` import)
- `opencode/commands/`, `opencode/agents/` — `/ai4s-*` 및 `@ai4s-*` 마크다운
- `schema/`, `fixtures/`, `test/`, `install.sh`

## ChatGPT 공유에 관한 주의

`/ai4s-import-conversation`은 당신이 직접 만들어 툴에 넘긴 **공개** 공유 페이지를
**한 번, 사용자 주도로 fetch**합니다 — 대량 스크래핑, 인증 우회, ChatGPT UI 자동화가
아닙니다. 공개 공유 페이지가 이미 제공하는 대화를 읽을 뿐입니다. fetch 자체를 피하고 싶다면
`/ai4s-ingest`로 handoff를 손으로 붙여넣으세요. 어느 쪽이든 공유 링크는 provenance URL로만
저장됩니다.

민감한 연구 데이터를 공유 링크에 넣지 마세요: 링크가 있는 사람은 누구나 볼 수 있고, 만료나
세분화된 권한이 없습니다.
