import "server-only"

const UNSTRUCTURED_URL =
  process.env.UNSTRUCTURED_API_URL ||
  "https://api.unstructuredapp.io/general/v0/general"

type UnstructuredElement = { type?: string; text?: string }

function joinElementTexts(payload: unknown): string {
  if (!Array.isArray(payload)) return ""
  const texts = (payload as UnstructuredElement[])
    .map((el) => (typeof el?.text === "string" ? el.text.trim() : ""))
    .filter(Boolean)
  return texts.join("\n\n").trim()
}

/** 서버 `.env`에 키가 있을 때만 Unstructured API를 호출할 수 있습니다. */
export function isUnstructuredApiConfigured(): boolean {
  return Boolean(process.env.UNSTRUCTURED_API_KEY?.trim())
}

/**
 * Unstructured Partition API로 PDF 등에서 텍스트 추출 (pdf.js 폴백용).
 * OCR/스캔 본은 향후 동일 엔드포인트 확장으로 연결 가능.
 */
export async function extractTextWithUnstructured(
  file: File
): Promise<{ text: string }> {
  const apiKey = process.env.UNSTRUCTURED_API_KEY
  if (!apiKey?.trim()) {
    throw new Error("UNSTRUCTURED_API_KEY is not configured")
  }

  const form = new FormData()
  form.append("files", file, file.name || "document.pdf")

  /**
   * 스캔·이미지 PDF는 `ocr_only` 또는 `hi_res`가 유리할 수 있음(비용·지연↑).
   * @see https://docs.unstructured.io/api-reference/api-services/partitioning
   */
  const strategy = process.env.UNSTRUCTURED_PARTITION_STRATEGY?.trim()
  if (strategy) {
    form.append("strategy", strategy)
  }
  const languages = process.env.UNSTRUCTURED_OCR_LANGUAGES?.trim()
  if (languages) {
    form.append("languages", languages)
  }

  const res = await fetch(UNSTRUCTURED_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "unstructured-api-key": apiKey,
    },
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(
      `Unstructured API failed (${res.status}): ${errText.slice(0, 200)}`
    )
  }

  const data: unknown = await res.json()
  const text = joinElementTexts(data)
  return { text }
}
