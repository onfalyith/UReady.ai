/**
 * 브라우저에서 사용: `/api/dify/analyze`로 PDF를 보내 서버가 Dify를 호출합니다.
 * API 키는 서버에서만 사용됩니다.
 */
export type AnalyzePdfClientResult = {
  ok: true
  fileId: string
  /** Dify POST /workflows/run (blocking) 응답 */
  workflow: Record<string, unknown>
}

export type AnalyzePdfClientError = {
  ok: false
  status: number
  message: string
  detail?: string
}

export async function analyzePdfViaApi(
  file: File,
  options?: {
    /** 기본값: anonymous */
    user?: string
    /** Dify 워크플로 파일 입력 변수명 */
    fileInputKey?: string
  }
): Promise<AnalyzePdfClientResult | AnalyzePdfClientError> {
  const form = new FormData()
  form.append("file", file)
  if (options?.user) form.append("user", options.user)
  if (options?.fileInputKey) form.append("fileInputKey", options.fileInputKey)

  const res = await fetch("/api/dify/analyze", {
    method: "POST",
    body: form,
  })

  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    return {
      ok: false,
      status: res.status,
      message: "Invalid JSON response",
      detail: text,
    }
  }

  if (!res.ok) {
    const err = json as { message?: string; detail?: string }
    return {
      ok: false,
      status: res.status,
      message: err?.message ?? `Request failed (${res.status})`,
      detail: err?.detail,
    }
  }

  const data = json as AnalyzePdfClientResult
  if (data && typeof data === "object" && data.ok === true) {
    return data
  }

  return {
    ok: false,
    status: res.status,
    message: "Unexpected response shape",
    detail: text,
  }
}
