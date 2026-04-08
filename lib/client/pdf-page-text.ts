import { PDFJS_BROWSER_WORKER_URL } from "@/lib/api/extract-pdf-client"

/** pdf.js getTextContent().items → 페이지 문자열 (PdfPagesPanel과 동일 규칙) */
export function pageTextFromContent(
  items: Array<{ str?: string } & Record<string, unknown>>
): string {
  const parts = items
    .map((item) => {
      if (item && typeof item === "object" && "str" in item) {
        return String((item as { str: string }).str)
      }
      return ""
    })
    .filter(Boolean)
  return parts.join(" ").trim()
}

/**
 * 허점 카드 (p. n) 계산용 — PdfPagesPanel 마운트 여부와 무관하게 페이지별 텍스트 확보.
 * 패널이 언마운트되며 추출이 끊기는 경우를 막는다.
 */
export async function extractPdfPageTextsArray(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_BROWSER_WORKER_URL

  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
  }).promise

  const texts: string[] = []
  const n = pdf.numPages as number
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p)
    const textContent = await page.getTextContent()
    const raw = pageTextFromContent(
      textContent.items as Array<{ str?: string } & Record<string, unknown>>
    )
    texts.push(raw)
  }
  return texts
}
