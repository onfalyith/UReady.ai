import "server-only"
import type { VerificationAnalysis } from "@/lib/verification/schema"
import { createHash } from "crypto"
import { createServerSupabaseClient } from "@/lib/db/supabase"

type PersistArgs = {
  analysis: VerificationAnalysis
  sourceText: string
}

/**
 * 선택 저장: 환경 변수가 있을 때만 JSON 결과와(옵션) 원문을 적재합니다.
 * 민감 정보 기본 비저장 — STORE_VERIFICATION_SOURCE_TEXT=true 일 때만 원문 컬럼에 저장.
 */
export async function persistVerificationResult({
  analysis,
  sourceText,
}: PersistArgs): Promise<void> {
  const supabase = createServerSupabaseClient()
  if (!supabase) return

  const storeSource = process.env.STORE_VERIFICATION_SOURCE_TEXT === "true"
  const hash = createHash("sha256").update(sourceText).digest("hex")

  const row = {
    content_hash: hash,
    result: analysis,
    source_text: storeSource ? sourceText : null,
    created_at: new Date().toISOString(),
  }

  const { error } = await supabase.from("presentation_verifications").insert(row)
  if (error) {
    // 테이블 미생성·스키마 불일치 시에도 API 응답은 유지 (로그만 최소)
    if (process.env.NODE_ENV === "development") {
      console.warn("[supabase] persist skipped:", error.message)
    }
  }
}
