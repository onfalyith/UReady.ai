"use client"

import type { PdfJsExtractionMeta } from "@/lib/pdf/extraction-heuristic"
import { isPdfJsExtractionLowQuality } from "@/lib/pdf/extraction-heuristic"

/** package.json의 pdfjs-dist와 맞춤 (worker/main 불일치 시 런타임 오류 방지) */
export const PDFJS_DIST_VERSION = "5.6.205"

export const PDFJS_BROWSER_WORKER_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_DIST_VERSION}/legacy/build/pdf.worker.min.mjs`

type BrowserPdfExtractOk = {
  ok: true
  text: string
  meta: PdfJsExtractionMeta
}

type BrowserPdfExtractErr = {
  ok: false
  error: string
}

type BrowserPdfExtractResult = BrowserPdfExtractOk | BrowserPdfExtractErr

async function extractPdfTextInBrowser(
  file: File
): Promise<BrowserPdfExtractResult> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_BROWSER_WORKER_URL

    const data = new Uint8Array(await file.arrayBuffer())
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
    })

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

    const text = parts.filter(Boolean).join("\n\n").trim()

    return {
      ok: true,
      text,
      meta: { numPages: pdf.numPages, pageCharCounts },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pdf.js 추출 실패"
    return { ok: false, error: msg }
  }
}

export type ExtractPdfOk = {
  success: true
  text: string
  source: "pdfjs" | "unstructured"
}

export type ExtractPdfErr = {
  success: false
  error: string
}

export type ExtractPdfResponse = ExtractPdfOk | ExtractPdfErr

/**
 * Vercel 등 서버리스는 요청 본문이 ~4.5MB를 넘기면 413이 나므로,
 * 그보다 작은 PDF만 서버 추출(Unstructured 폴백) API로 보냅니다.
 */
export const MAX_PDF_BYTES_FOR_SERVER_EXTRACT = 4 * 1024 * 1024

export async function extractPdfViaApi(
  file: File
): Promise<ExtractPdfResponse> {
  const fd = new FormData()
  fd.append("file", file)

  let res: Response
  try {
    res = await fetch("/api/extract-pdf", {
      method: "POST",
      body: fd,
    })
  } catch {
    return { success: false, error: "네트워크 오류로 추출 요청에 실패했습니다." }
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { success: false, error: "서버 응답을 해석할 수 없습니다." }
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    (data as { success: unknown }).success === true &&
    "text" in data &&
    typeof (data as { text: unknown }).text === "string" &&
    "source" in data &&
    ((data as { source: unknown }).source === "pdfjs" ||
      (data as { source: unknown }).source === "unstructured")
  ) {
    return {
      success: true,
      text: (data as ExtractPdfOk).text,
      source: (data as ExtractPdfOk).source,
    }
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    (data as { success: unknown }).success === false &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return { success: false, error: (data as ExtractPdfErr).error }
  }

  return { success: false, error: "알 수 없는 응답 형식입니다." }
}

/**
 * 먼저 브라우저에서 pdf.js로 추출하고, 품질이 낮을 때만(그리고 파일이 작을 때만) 서버 API를 호출합니다.
 */
export async function extractPdfForUpload(
  file: File
): Promise<ExtractPdfResponse> {
  const browser = await extractPdfTextInBrowser(file)

  const canUseServer =
    file.size > 0 && file.size <= MAX_PDF_BYTES_FOR_SERVER_EXTRACT

  if (browser.ok) {
    const low = isPdfJsExtractionLowQuality(browser.text, browser.meta)
    if (!low && browser.text.trim()) {
      return { success: true, text: browser.text, source: "pdfjs" }
    }
    if (canUseServer) {
      return extractPdfViaApi(file)
    }
    return {
      success: false,
      error:
        "PDF에서 읽은 텍스트가 매우 적습니다(스캔·이미지 위주일 수 있습니다). 서버에서 다시 추출하려면 파일이 4MB 이하여야 하는데, 지금 파일은 더 큽니다. 텍스트(.txt)로 올리거나, 용량을 줄인 뒤 다시 시도해 주세요.",
    }
  }

  if (canUseServer) {
    return extractPdfViaApi(file)
  }

  return {
    success: false,
    error: `브라우저에서 PDF를 읽지 못했습니다: ${browser.error} 파일이 ${MAX_PDF_BYTES_FOR_SERVER_EXTRACT / (1024 * 1024)}MB 이하면 서버 추출을 시도할 수 있으나, 현재 파일은 더 큽니다.`,
  }
}
