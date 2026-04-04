/**
 * 브라우저에서 PDF 텍스트 레이어를 읽습니다. (클라이언트 전용)
 * 스캔 전용 PDF(이미지만 있는 경우)는 텍스트가 거의 없을 수 있습니다.
 */
function setPdfWorkerSrc(
  pdfjs: Awaited<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>
) {
  if (typeof window === "undefined") return

  try {
    // 배포 환경에서 CDN 접근 제한이 있을 수 있어, 번들된 worker 경로를 우선 사용합니다.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString()
  } catch {
    // 번들 경로 해석 실패 시 기존 CDN 경로로 폴백
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`
  }
}

export async function extractTextFromPdfFile(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  setPdfWorkerSrc(pdfjs)

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true })
  const pdf = await loadingTask.promise

  const parts: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => {
        if (item && typeof item === "object" && "str" in item) {
          return (item as { str: string }).str
        }
        return ""
      })
      .filter(Boolean)
      .join(" ")
    parts.push(pageText.trim())
  }

  return parts.filter(Boolean).join("\n\n").trim()
}

export async function extractTextFromPdfFileWithMeta(
  file: File
): Promise<{
  text: string
  numPages: number
  pageCharCounts: number[]
}> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  setPdfWorkerSrc(pdfjs)

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true })
  const pdf = await loadingTask.promise

  const parts: string[] = []
  const pageCharCounts: number[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => {
        if (item && typeof item === "object" && "str" in item) {
          return (item as { str: string }).str
        }
        return ""
      })
      .filter(Boolean)
      .join(" ")
    const trimmed = pageText.trim()
    parts.push(trimmed)
    pageCharCounts.push(trimmed.replace(/\s/g, "").length)
  }

  return {
    text: parts.filter(Boolean).join("\n\n").trim(),
    numPages: pdf.numPages,
    pageCharCounts,
  }
}
