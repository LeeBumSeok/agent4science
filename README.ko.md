# agent4science

[English](README.md) | **한국어**

웹 연구 대화를 **재현 가능한 CLI 기반 실험**으로 바꿔주는, **OpenCode**·**Claude Code**·
**Codex**용 플러그인/에이전트입니다.

## 왜 웹 연구 모델인가?

연구 아이디어를 *얻고 검증*하기 가장 좋은 곳은, 지금으로선 **당신이 접근 가능한 가장 똑똑한
모델과의 웹 채팅**입니다 — 예를 들어 **GPT Pro**나 **Claude / Fable**. 아이디어가 참신한지
판단하고, 실험 설계의 허점을 찌르고, 대안을 저울질하고, 지저분한 결과를 해석하는 가장 강한
추론이 거기 있습니다. 그리고 그런 최상위 웹 모드는 대개 터미널에서 직접 몰거나 CLI 에이전트
루프에 저렴하게 엮을 수 있는 대상이 아닙니다. 반대로 CLI에서 돌릴 수 있는 코딩 모델들은
구현은 훌륭하지만 그런 깊은 연구 판단에는 약합니다.

agent4science는 이 간극을 잇습니다: **어려운 사고는 당신에게 가장 똑똑한 웹 모델에서 하고,
그 대화 전체를 코딩 에이전트로 넘기면** 실험을 구현·실행·분석하고, 결과를 다시 웹으로 가져갈
프롬프트까지 만들어 다음 반복으로 이어줍니다. 특정 제품을 꼭 쓰라는 게 아니라 하나의 *형식*
입니다: 판단은 웹 추론에, 재현 가능한 실행은 당신의 터미널에.

## 사용 방법

웹 모델을 연구 PI로 씁니다 — 아이디어를 브레인스토밍하고, 가설을 다듬고, 실험을 설계하죠.
그다음 연구를 코딩 에이전트로 가져오는 방법은 두 가지입니다: **공유된 대화 전체를
가져오거나**(`/ai4s-import-conversation <share-url>` — ChatGPT *와* Claude 공유 링크 모두 지원),
압축된 `AI4S-HANDOFF-V1` 블록을 붙여넣거나(`/ai4s-ingest`). 이후는 파이프라인이 알아서
진행합니다: validate → plan → implement → run → analyze → report → 그리고 웹으로 넘길 다음
반복용 프롬프트 생성까지.

LLM API는 쓰지 않습니다. 유일한 네트워크 호출은 당신이 명시적으로 제공한 **공개 공유 페이지를
한 번 가져오는 것**뿐이며, 링크는 출처(provenance) URL로만 저장됩니다. 아래
[공유에 관한 주의](#공유에-관한-주의)를 참고하세요.

OpenCode에서는 `ai4science` primary 에이전트가 보이고 선택하는 대상이며 전문 서브에이전트에게
위임합니다. Claude Code와 Codex에서는 동일한 파이프라인이 `agent4science` CLI를 통해 돌아갑니다.

## 왜 이런 구조인가

- **웹 연구 모델**(GPT Pro, Claude/Fable, …) = 깊은 연구 판단(참신성, 실험 설계, 해석).
- **당신의 코딩 에이전트**(OpenCode / Claude Code / Codex) = 구현, 실험, 분석, 재현성.
- **`AI4S-HANDOFF-V1` 블록** = 둘 사이의 단일 실행 계약. CLI는 자유 형식의 대화가 아니라
  *명세(spec)*를 실행합니다.
- **`.ai4science/` 장부(ledger)** = 단일 진실 공급원: 상태, handoff, provenance, 실행
  기록(run registry), 리포트.

## 설치

`--target`으로 코딩 에이전트를 고릅니다(기본 `opencode`):

```bash
# npm bin으로 (oh-my-openagent 설치기처럼)
npm install -g agent4science          # Claude Code / Codex도 CLI를 쓰므로 필요

agent4science install --global                      # OpenCode, 모든 프로젝트
agent4science install --global --target claude      # Claude Code (~/.claude)
agent4science install --global --target codex       # Codex (~/.codex/prompts)
agent4science install --global --target all         # 셋 다

# 또는 이 저장소 클론에서 install.sh로 동일하게
./install.sh --global --target all
./install.sh /path/to/project --target opencode     # 프로젝트 로컬 .opencode/
```

이게 "등록"의 전부입니다 — 각 에이전트는 설정 디렉토리에 놓인 것을 **자동 로드**하므로 손으로
편집할 게 없습니다. 설치기는:

- **OpenCode**: JS 플러그인(코어 라이브러리는 형제 `.opencode/ai4s-core/`로), `/ai4s-*`
  커맨드, 에이전트(`ai4science` primary + `@ai4s-*` 서브에이전트)를 복사하고 **`yaml`
  의존성을 자동 조달**합니다. 단수/복수 디렉토리 이름을 감지합니다(`--singular`로
  `plugin/ command/ agent/` 강제).
- **Claude Code**: `ai4science` + `@ai4s-*` 서브에이전트를 `.claude/agents/`에, `/ai4s-*`
  슬래시 커맨드를 `.claude/commands/`에 복사합니다. 커맨드는 `agent4science` CLI를 구동합니다.
- **Codex**: `/ai4s-*` 커스텀 프롬프트를 `~/.codex/prompts/`에 복사하며, 역시 CLI를 구동합니다.

설치 후 코딩 에이전트를 재시작하세요. OpenCode에서는 `ai4science` 에이전트가 TUI 전환기(Tab)에
보이고, 셋 다 `/ai4s-*` 커맨드가 준비됩니다.

## 지원하는 코딩 에이전트

| 에이전트 | 툴 실행 방식 | 설치되는 자산 |
|---|---|---|
| [OpenCode](https://opencode.ai) | 네이티브 JS 플러그인(커스텀 툴 + `tool.execute.before` 안전 훅) | 플러그인, `ai4science` primary, `@ai4s-*` 서브에이전트, `/ai4s-*` 커맨드 |
| [Claude Code](https://claude.com/claude-code) | Bash로 `agent4science` CLI | `ai4science` + `@ai4s-*` 서브에이전트, `/ai4s-*` 커맨드 |
| [Codex CLI](https://developers.openai.com/codex/cli) | 셸로 `agent4science` CLI | `/ai4s-*` 커스텀 프롬프트 |

파이프라인 로직은 어디서나 동일합니다 — OpenCode 플러그인과 `agent4science` CLI가 함께 호출하는
코어에 들어 있습니다.

## 워크플로우

```
/ai4s-init <goal>          .ai4science/ 장부 초기화.
/ai4s-pro-prompt           연구 토론 프롬프트 생성 → 당신의 웹 모델에 붙여넣기.
   (웹 모델에서 토론: 질문 명료화, 가설, 최소 실험)

   그다음 아래 둘 중 한 경로로 연구를 가져오기:
   A) 전체 대화 (권장):
      /ai4s-import-conversation <share-url>   ChatGPT 또는 Claude 공유를 fetch + 디코딩.
   B) 압축 handoff:
      /ai4s-handoff-request                   "produce handoff" 지시문 받기 → 붙여넣기.
      /ai4s-ingest <block>                    AI4S-HANDOFF-V1 블록 검증 + 저장.

/ai4s-validate             심층 검증. 압축 handoff면 그걸 검증하고, 전체 대화면 트랜스크립트
                           에서 구조화된 handoff.yaml을 도출(구체적 실험이 없으면 정직하게 보고).
/ai4s-plan                 저장소 매핑 + 구현 계획 (서브에이전트 2개)
/ai4s-implement            계획 구현 + 스모크 테스트
/ai4s-run                  스모크 테스트 후 seed별 실험; 모든 실행 기록
/ai4s-analyze              사전 등록된 계획 대비 분석 → analysis.md
/ai4s-report               연구 리포트 작성
/ai4s-pro-review           다음 반복용 프롬프트 생성 → 웹 모델에 붙여넣고, 루프
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

- **전체 대화 (`/ai4s-import-conversation <share-url>`)** — 공개 공유를 (당신의 명시적 요청으로)
  한 번 fetch하고, 트랜스크립트를 디코딩해 대화 전체를 `.ai4science/pro_conversation.md`에
  저장합니다. 대화 전체가 연구 컨텍스트가 되고, `/ai4s-validate`가 거기서 구조화된
  `handoff.yaml`을 도출합니다. 공유 링크는 provenance URL로만 저장됩니다. 현재 지원:
  - **ChatGPT** (`chatgpt.com/share/...`) — 공유 페이지가 트랜스크립트를 서버 렌더링합니다.
  - **Claude** (`claude.ai/share/...`) — 스냅샷을 공개 엔드포인트
    `api.anthropic.com/api/chat_snapshots/<id>`에서 읽습니다.
- **압축 handoff (`/ai4s-ingest <block>`)** — 웹 모델이 만든 `AI4S-HANDOFF-V1` 블록을 직접
  붙여넣습니다. 더 작지만 손으로 복사해야 하며, 어떤 모델이든 됩니다.

둘 다 동일한 하위 파이프라인(validate → plan → implement → run → analyze)으로 수렴합니다.

## handoff 계약

`AI4S-HANDOFF-V1`은 하나의 YAML 블록입니다. 웹 모델에게 보여줄 것과 동일한 전체 명세는
[`schema/ai4s-handoff-v1.md`](schema/ai4s-handoff-v1.md)에 완전한 예시와 함께 있습니다.
필수 최상위 요소: `project`, `hypothesis`, `experiment`(baseline 최소 1개, primary metric,
success/failure 기준, seeds 포함), `implementation.tasks`, `analysis_plan`,
`safety.risk_level`, `cli_must_not`.

## 안전장치

handoff는 **신뢰할 수 없는 입력**입니다. 세 겹으로 실행을 방어합니다:

1. **스키마 검증** — 필수 필드 누락 → `needs_revision` + 웹 모델에 되붙여넣을 patch request.
   잘못된 스키마 id, 위험 명령, `.ai4science/`를 벗어나는 artifact 경로 → `blocked`(아무것도
   저장 안 함).
2. **명령 denylist** — handoff가 제안하는 모든 명령과, ai4science 프로젝트 안의 모든 `bash`
   호출을 검사합니다. 재귀 강제 삭제, `sudo`, 원격 콘텐츠를 셸로 파이프, force push,
   클라우드/인프라 CLI, 자격증명 접근 등을 거부합니다. OpenCode에서는 `tool.execute.before`
   훅이 런타임에 강제하고, 에이전트는 `agent4science safety-check`로 자가 검사합니다.
3. **상태 머신 + append-only 레지스트리** — 단계는 순서대로 실행되고, 실패한 실행은 절대
   삭제되지 않으며, 가설·metric·success 기준은 임의로 변경되지 않습니다.

고위험 도메인(`safety.risk_level: high`)은 파이프라인이 검증을 넘어 진행하기 전에 당신의
명시적 승인을 요구합니다.

## 에이전트

`ai4science`는 **primary** 에이전트로 OpenCode TUI 에이전트 전환기(Tab)에 보이며 전체
파이프라인을 몰고, 아래 전문 **서브에이전트**들에게 위임합니다. 서브에이전트는 설계상 primary
전환기에 나타나지 않습니다. `@ai4s-...`로 멘션하거나 `/ai4s-*` 커맨드가 자동 위임합니다.
(Claude Code에도 동일한 에이전트/커맨드가 설치됩니다.)

| 에이전트 | 모드 | 역할 |
|---|---|---|
| `ai4science` | primary | PI 오케스트레이터 — TUI에 보이고 파이프라인을 몲 |
| `@ai4s-intake-validator` | subagent | handoff를 신뢰할 수 없는 입력으로 검증 |
| `@ai4s-repo-cartographer` | subagent | 실험이 놓일 위치를 읽기 전용으로 조사 |
| `@ai4s-experiment-planner` | subagent | handoff + 저장소 맵 → 최소 계획으로 변환 |
| `@ai4s-implementation-engineer` | subagent | 계획을 충실히 구현, 스모크 테스트 포함 |
| `@ai4s-experiment-runner` | subagent | 승인된 명령만 실행, 모든 실행 기록 |
| `@ai4s-result-analyst` | subagent | 사전 등록 계획 대비 분석, 리포트 작성 |
| `@ai4s-pro-feedback-composer` | subagent | 다음 반복용 웹 모델 프롬프트 생성 |

## 개발

코어 로직은 `src/core/` 아래의 순수 JavaScript이며, Node 내장 러너로 테스트합니다(OpenCode나
bun 불필요):

```bash
npm test                    # node --test — 코어 + 어댑터 75개 테스트
npm run lint:frontmatter    # 모든 command/agent 마크다운 파일 검증
node scripts/build-cross-agent.js   # claude/ 와 codex/ 자산을 소스에서 재생성
```

구성:

- `src/core/` — `safety`, `state`, `handoff`, `conversation`, `ledger`, `prompts`, `fetch`,
  `actions` (순수/테스트 가능); `install.sh`가 이것들을 `.opencode/ai4s-core/`로 복사
- `bin/agent4science.js` — CLI: 설치기 + 파이프라인 서브커맨드 (Claude Code/Codex가 사용)
- `opencode/` — OpenCode 플러그인(`plugins/ai4science.js`), 커맨드, 에이전트
- `claude/`, `codex/` — 생성된 Claude Code·Codex 자산 (`scripts/build-cross-agent.js`)
- `schema/`, `fixtures/`, `test/`, `install.sh`

## 공유에 관한 주의

`/ai4s-import-conversation`은 당신이 직접 만들어 툴에 넘긴 **공개** 공유를 **한 번, 사용자
주도로 fetch**합니다 — 대량 스크래핑, 인증 우회, 어떤 웹 UI 자동화도 아닙니다. 공개 공유가
이미 제공하는 대화(ChatGPT 또는 Claude)를 읽을 뿐입니다. fetch 자체를 피하고 싶다면
`/ai4s-ingest`로 handoff를 손으로 붙여넣으세요. 어느 쪽이든 공유 링크는 provenance URL로만
저장됩니다.

민감한 연구 데이터를 공유 링크에 넣지 마세요: 링크가 있는 사람은 누구나 볼 수 있고, 만료나
세분화된 권한이 없습니다.
