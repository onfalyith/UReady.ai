-- 1) 기본 테이블 (pgvector 없이도 실행 가능)
create table if not exists public.presentation_verifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content_hash text not null,
  result jsonb not null,
  source_text text
);

create index if not exists presentation_verifications_created_at_idx
  on public.presentation_verifications (created_at desc);

comment on table public.presentation_verifications is
  '발표 검증 분석 결과(JSON). source_text는 STORE_VERIFICATION_SOURCE_TEXT=true 일 때만 채움.';

-- 2) pgvector 사용 시 Supabase에서 extension 활성화 후 실행:
-- create extension if not exists vector;
-- alter table public.presentation_verifications
--   add column if not exists embedding vector(768);
