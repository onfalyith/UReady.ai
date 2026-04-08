# UReady.ai

AI가 작성한 발표 자료 속 **환각 정보**, **출처 불명 수치**, **이해가 얕은 개념 설명**, **논리적 취약점**을 찾아  
발표자의 **가짜 지식 노출 위험**과 **질문 대응 불안**을 줄여주는 **AI 허점 스캐너 MVP**입니다.

본 사용자 테스트는 **대학(원)생**을 대상으로 진행하며,  
특히 AI로 작성한 발표자료나 대본에서 **환각 정보**와 **논리적 취약점**을 인지하지 못해  
발표에서 가짜 지식이 탄로날까 두려워하는 문제를 검증합니다.

---

## 문제 정의

AI를 사용하면 발표 자료를 빠르게 만들 수 있습니다.  
하지만 아래 같은 문제가 자주 발생합니다.

- 수치나 주장에 **출처가 없는데도 그럴듯하게 보이는 경우**
- 개념을 **아는 것처럼 썼지만 실제로 설명은 못 하는 경우**
- “왜?”, “근거는?”, “다른 대안은?” 같은 질문 앞에서 **논리가 무너지는 경우**
- 발표 직전까지도 **어디가 허점인지 스스로 찾지 못하는 경우**

UReady.ai는 이 문제를 해결하기 위해  
업로드된 자료를 읽고, 외부 검색으로 출처를 검증하고,  
발표자가 질문을 받았을 때 방어하기 어려운 부분을 찾아냅니다.

---

## 핵심 가치

1. **정확한 내용 추출**  
   사용자가 올린 TXT/PDF 자료에서 실제 분석 가능한 텍스트를 안정적으로 추출합니다.

2. **외부 검색 기반 출처 검증**  
   발표 자료 속 주장과 수치를 실제 웹 검색으로 확인하고, 근거 부족 여부를 판단합니다.

3. **발표 방어 중심 허점 분석**  
   보기 좋은 첨삭보다, 질문이 들어왔을 때 막힐 수 있는 부분을 먼저 드러냅니다.

---

## 주요 기능

- TXT 파일 업로드 및 즉시 텍스트 반영
- PDF 업로드 후 텍스트 추출
- 발표 대본 직접 붙여넣기
- 외부 검색 기반 출처 검증
- 허점 분석 결과 카드 출력
- 발표 방어를 위한 개선 질문 제시

---

## 분석 결과 형식

각 이슈 카드에서 **논리적 취약점**과 **반론**을 중심으로 보여 주며,  
같은 카드에 **위치**, **원문 문장**, **개선 방향**, **출처 및 근거(evidence)** 를 함께 표시합니다.

각 이슈는 아래 정보를 포함합니다.

- 위치
- 원문 문장
- 논리적 취약점
- 반론
- 개선 질문
- evidence(출처 근거: `title`, `url`, `snippet`, `stance`)

`stance`는 한국어로 **근거 확인**, **근거 다름**, **근거 부족** 중 하나입니다.  
출처를 찾지 못하거나 근거가 불충분한 경우 **근거 부족**으로 처리합니다.

---

## 사용자 테스트 대상

본 MVP는 아래 사용자군을 중심으로 검증합니다.

- 발표 비중이 높은 전공 대학생
- 취업·대외활동 준비 대학생
- 대학원생 및 연구 발표자
- 졸업 후 발표/면접/피칭 준비를 이어가는 사용자

특히 다음 문제를 가진 사용자를 주요 대상으로 봅니다.

- AI가 만든 발표 자료를 **내 것으로 이해하지 못한 상태**
- 발표 중 **가짜 지식이 드러날까 불안한 상태**
- 스스로 허점을 찾기 어렵고, **객관적 피드백이 부족한 상태**

---

## 기술 스택

- **Framework**: Next.js App Router
- **Language**: TypeScript
- **API**: Route Handlers
- **UI**: Tailwind CSS
- **LLM SDK**: Vercel AI SDK
- **Schema Validation**: Zod
- **Model**: 기본 `gemini-3.1-pro-preview` (Search grounding + Thinking; `GEMINI_ANALYSIS_MODEL_ID`로 다른 `gemini-…` 지정 가능)
- **Search Verification**: Gemini Grounding with Google Search
- **PDF Extraction**: pdf.js
- **Fallback Extraction**: Unstructured
- **Database**: Supabase
- **Vector Extension**: pgvector
- **Rate Limit**: Upstash

---

## 시스템 동작 방식

### 1. 입력

사용자는 아래 방식 중 하나로 자료를 제공합니다.

- TXT 파일 업로드
- PDF 파일 업로드
- 텍스트 직접 붙여넣기

### 2. 텍스트 추출

- TXT는 클라이언트에서 `FileReader`로 즉시 읽습니다.
- PDF는 서버 측 Route Handler(`app/api/extract-pdf`)에서 처리합니다.
- PDF는 먼저 `pdf.js`로 추출합니다.
- 추출 품질이 낮으면 `Unstructured`를 fallback으로 사용합니다.

### 3. 외부 검색 검증

- Gemini Grounding with Google Search를 사용해 주장과 수치의 출처를 확인합니다.
- 기본 파이프라인은 **검색 단계 → JSON 합성 단계**로 나뉩니다. 한 번에 끝내는 모드는 `ANALYSIS_DISABLE_SPLIT_PHASE` 등으로 선택할 수 있습니다.
- 출처를 찾지 못한 경우 근거를 추정하지 않고 **근거 부족**으로 처리합니다.

### 4. 허점 분석

- 발표자가 질문을 받았을 때 방어하기 어려운 부분을 찾습니다.
- 특히 아래를 중점적으로 봅니다.
  - 출처 불명 수치
  - 설명은 있어 보이지만 이해가 얕은 개념
  - 근거 없는 최상급 표현
  - 비교 기준 없는 결론
  - 논리 전개가 건너뛰는 문장

### 5. 결과 렌더링

- 결과는 자유 텍스트가 아니라 구조화된 JSON으로 반환합니다.
- 프론트는 JSON을 직접 카드 UI로 렌더링합니다.

---

## 프로젝트 구조 예시

```bash
app/
  page.tsx
  api/
    extract-pdf/
      route.ts
    analyze/
      route.ts

components/
  main-input.tsx
  result-screen.tsx
  issue-card.tsx
  evidence-list.tsx
  uready/
    upload-screen.tsx
    loading-screen.tsx

lib/
  ai/
    schema.ts
    prompt.ts
    analyze.ts
    gemini-model.ts
  pdf/
    extract-with-pdfjs.ts
    extract-with-unstructured.ts
  uready/
    state.ts
    types.ts
  db/
    supabase.ts
  rate-limit/
    upstash.ts

types/
  analysis.ts
```

---

## 필드 설명

- `location`: 문장 번호 또는 위치 정보
- `originalText`: 원문 문장
- `logicalWeakness`: 발표자가 방어하기 어려운 논리적 취약점
- `counterArgument`: 실제로 들어올 수 있는 반론
- `improvementQuestion`: 발표자가 스스로 보완할 수 있도록 돕는 질문
- `evidence`: 외부 검색으로 찾은 검증 근거 목록

---

## 구현 금지 사항

아래 방식은 금지합니다.

- `dangerouslySetInnerHTML` 사용
- LLM이 반환한 HTML 문자열을 그대로 렌더링
- 출처를 찾지 못했는데 임의로 링크/제목/snippet 생성
- 추출 단계 없이 파일 원본만 바로 분석에 투입
- API 키, service role key 등을 클라이언트 코드에 노출
- 전체 민감 입력 원문을 로그에 그대로 남기는 행위

---

## API 규칙

- PDF 추출 API는 `app/api/extract-pdf/route.ts`에서 처리합니다.
- 분석 API는 `app/api/analyze/route.ts`에서 처리합니다.
- 두 API 모두 Upstash rate limit을 적용합니다.
- 모든 API는 JSON 형식으로 응답합니다.
- 실패 시에도 프론트에서 처리 가능한 명확한 JSON 에러 메시지를 반환해야 합니다.

---

## 저장 규칙

저장 구조는 Supabase + pgvector 기준으로 설계합니다.  
최소한 아래 개념을 분리 저장할 수 있어야 합니다.

- `documents`
- `document_chunks`
- `analysis_results`
- `evidences`

pgvector는 추후 유사 문장 검색과 근거 재매칭을 고려한 확장 구조로 둡니다.  
서버 전용 키는 반드시 서버에서만 사용합니다.

---

## 코드 수정 원칙

- 작업 전 기존 구조를 먼저 읽고, 영향 받는 파일을 파악합니다.
- 한 번에 넓게 갈아엎기보다, 범위를 좁혀 점진적으로 수정합니다.
- 타입 정의, Zod 스키마, 프론트 props 구조를 서로 맞춘 상태로 유지합니다.
- 공통 로직은 `lib/` 아래로 분리합니다.
- UI 컴포넌트와 API 로직은 섞지 않습니다.
- 상태는 최소한 아래 단위로 분리합니다.

  - 입력 텍스트 상태
  - 추출 로딩 상태
  - 분석 로딩 상태
  - 결과 상태
  - 에러 상태

---

## 완료 기준

아래 조건을 만족해야 구현 완료로 봅니다.

- PDF는 pdf.js 우선, 필요 시 Unstructured fallback 구조를 가진다.
- `/api/analyze`는 Gemini와 Google Search grounding을 실제로 사용한다 (기본 모델은 `gemini-3.1-pro-preview`, 사고 모드는 `GEMINI_THINKING_LEVEL` 등 `.env.example` 참고).
- 분석 결과는 Zod 검증된 JSON으로 반환된다.
- 결과 카드에는 논리적 취약점·반론이 드러나며, 위치·원문·개선 질문·evidence가 함께 표시된다.
- evidence에는 `title`, `url`, `snippet`, `stance`가 포함된다.
- 출처가 없거나 불충분하면 **근거 부족**으로 표시된다.
- 로딩 상태, 에러 상태, 빈 결과 상태가 구현되어 있다.
- 타입 에러와 빌드 에러가 없다.

---

## 작업 전 체크리스트

작업 시작 전 아래를 먼저 확인합니다.

- 현재 구조가 App Router 기준인지
- 수정 대상 파일이 무엇인지
- 타입/스키마/UI 구조가 충돌하지 않는지
- 이번 수정이 추출/검증/분석 중 어느 단계에 영향을 주는지
- 사용자 화면에 불필요한 내부 분류가 노출되지 않는지

---

## 작업 후 체크리스트

작업 후 아래를 확인합니다.

- 빌드 오류가 없는지
- 타입 오류가 없는지
- 업로드 → 추출 → 분석 → 결과 렌더링 흐름이 끊기지 않는지
- evidence가 실제 링크와 함께 정상 노출되는지
- 출처를 찾지 못한 경우 잘못된 확정 표현을 하지 않는지
- 모바일에서도 결과 카드가 읽히는지

---

## 로컬 실행

```bash
npm install
npm run dev
```

환경 변수는 `.env.example`을 참고해 `.env.local`에 설정합니다.
