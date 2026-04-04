import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * 서버 전용 Supabase (Service Role).
 * 클라이언트 번들에 포함되지 않도록 이 모듈은 API Route·Server Action 등에서만 import 하세요.
 */
export function createServerSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.trim() || !key?.trim()) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type { SupabaseClient }
