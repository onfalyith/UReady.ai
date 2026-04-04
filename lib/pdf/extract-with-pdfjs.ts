import "server-only"

import path from "node:path"
import { pathToFileURL } from "node:url"

import type { PdfJsExtractionMeta } from "./extraction-heuristic"

export type PdfJsExtractResult = {
  text: string
} & PdfJsExtractionMeta

/**
 * Node (Route Handler)에서 pdf.js로 텍스트 레이어를 읽습니다.
 * Worker는 node_modules 내 번들 경로를 file:// 로 지정합니다.
 */
export async function extractTextWithPdfJs(
  buffer: ArrayBuffer
): Promise<PdfJsExtractResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")

  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.min.mjs"
  )
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href

  const data = new Uint8Array(buffer)
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
    text,
    numPages: pdf.numPages,
    pageCharCounts,
  }
}
