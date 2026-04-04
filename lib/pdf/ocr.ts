"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */

export type OcrOptions = {
  lang?: string
  maxPages?: number
  /**
   * OCR 진행 중 UI에 보여줄 콜백(옵션)
   * pageIndex는 1부터 시작
   */
  onProgress?: (pageIndex: number, totalPages: number) => void
}

function getDefaultLang() {
  // 한국어 PDF가 많을 가능성 + 기본 영어 지원
  return "kor+eng"
}

function setPdfWorkerSrc(
  pdfjs: Awaited<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>
) {
  if (typeof window === "undefined") return

  try {
    // 배포 환경에서 외부 CDN 접근 실패를 줄이기 위해 번들 경로를 우선 사용
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString()
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`
  }
}

async function renderPageToCanvas(
  page: any,
  scale: number
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas 2d context not available")

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  await page.render({ canvasContext: context, viewport }).promise
  return canvas
}

export async function ocrFromPdfFile(
  file: File,
  options?: OcrOptions
): Promise<{ text: string; pagesProcessed: number; totalPages: number }> {
  const tesseract = await import("tesseract.js")
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  setPdfWorkerSrc(pdfjs)

  const lang = options?.lang ?? getDefaultLang()
  const maxPages = options?.maxPages ?? 5

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true })
  const pdf = await loadingTask.promise

  const totalPages = pdf.numPages
  const pagesToProcess = Math.min(totalPages, Math.max(1, maxPages))

  // tesseract.js v7에서는 loadLanguage/initialize가 제거되고 createWorker(langs)로 초기화합니다.
  const worker = await tesseract.createWorker(lang)

  const texts: string[] = []
  try {
    for (let p = 1; p <= pagesToProcess; p++) {
      options?.onProgress?.(p, totalPages)
      const page = await pdf.getPage(p)

      // 스캔본에서 글자가 너무 작으면 OCR 품질이 떨어집니다.
      // MVP: 2.0 스케일 기본값(속도 vs 정확도 절충)
      const canvas = await renderPageToCanvas(page, 2.0)
      const result = await worker.recognize(canvas)
      const pageText = (result?.data?.text ?? "").trim()
      if (pageText) texts.push(pageText)
    }
  } finally {
    await worker.terminate()
  }

  return {
    text: texts.join("\n\n").trim(),
    pagesProcessed: pagesToProcess,
    totalPages,
  }
}

