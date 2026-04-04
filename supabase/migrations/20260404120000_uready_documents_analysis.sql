-- UReady: 문서·청크(pgvector 준비)·분석·근거 저장
-- 적용: Supabase SQL Editor 또는 `supabase db push`
-- 임베딩 차원(1536)은 OpenAI text-embedding-3-small 등과 맞출 때 조정하세요.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- documents: 원문 단위(콘텐츠 해시로 중복 제거)
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  source_kind text not null check (source_kind in ('pdf', 'text', 'pasted')),
  title text,
  raw_text text,
  char_count integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_content_hash_idx on public.documents (content_hash);
create index if not exists documents_created_at_idx on public.documents (created_at desc);

-- ---------------------------------------------------------------------------
-- document_chunks: 유사도 검색용 — embedding 은 배치 잡에서 채움
-- vector 차원 변경 시: 컬럼 타입 vector(N) 재정의 + 인덱스 재생성
-- ---------------------------------------------------------------------------
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  char_start integer,
  char_end integer,
  embedding vector(1536),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists document_chunks_document_id_idx
  on public.document_chunks (document_id);

-- 데이터가 쌓인 뒤 생성 권장 (빈 테이블에서도 동작은 함)
-- cosine 유사도 예시:
-- create index document_chunks_embedding_hnsw
--   on public.document_chunks
--   using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- analysis_results: 분석 실행 1회당 1행 (히스토리 보존)
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  model_id text not null,
  raw_result jsonb not null,
  provider_metadata jsonb,
  grounding_steps jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analysis_results_document_id_idx
  on public.analysis_results (document_id);
create index if not exists analysis_results_created_at_idx
  on public.analysis_results (created_at desc);

-- ---------------------------------------------------------------------------
-- evidences: 이슈·evidence 정규화 (issue_index = issues 배열 인덱스)
-- ---------------------------------------------------------------------------
create table if not exists public.evidences (
  id uuid primary key default gen_random_uuid(),
  analysis_result_id uuid not null references public.analysis_results (id) on delete cascade,
  issue_index integer not null,
  evidence_index integer not null,
  title text not null,
  url text not null,
  snippet text not null,
  stance text not null check (stance in ('supports', 'contradicts', 'insufficient')),
  created_at timestamptz not null default now(),
  unique (analysis_result_id, issue_index, evidence_index)
);

create index if not exists evidences_analysis_result_id_idx
  on public.evidences (analysis_result_id);

-- ---------------------------------------------------------------------------
-- RLS (서비스 롤은 RLS 우회 — 앱은 Service Role만 서버에서 사용)
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.analysis_results enable row level security;
alter table public.evidences enable row level security;

-- anon/authenticated 직접 접근 차단 (정책 없음 = 거부)

comment on table public.documents is '발표 원문 단위; content_hash 로 중복 통합';
comment on column public.document_chunks.embedding is 'pgvector; 임베딩 파이프라인에서 업데이트';
comment on table public.analysis_results is 'Gemini 등 분석 1회 결과 JSON';
comment on table public.evidences is '분석 이슈별 검색 근거 행';
