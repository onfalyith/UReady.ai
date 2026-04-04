import {
  extractPdfRateLimitResponse,
  getRequestFingerprint,
  rateLimitExtract,
} from "@/lib/rate-limit"
import { savePdfExtractionRecord } from "@/lib/db/persist/presentation-pipeline"
import { extractTextWithPdfJs } from "@/lib/pdf/extract-with-pdfjs"
import { extractTextWithUnstructured } from "@/lib/pdf/extract-with-unstructured"
import { isPdfJsExtractionLowQuality } from "@/lib/pdf/extraction-heuristic"

export const runtime = "nodejs"

const MAX_BYTES = 15 * 1024 * 1024

type OkBody = { success: true; text: string; source: "pdfjs" | "unstructured" }
type ErrBody = { success: false; error: string }

function json<T extends OkBody | ErrBody>(data: T, status: number) {
  return Response.json(data, { status })
}

export async function POST(request: Request) {
  const limited = await rateLimitExtract(request)
  if (!limited.ok) {
    return extractPdfRateLimitResponse(limited.denied)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ success: false, error: "잘못된 요청 본문입니다." }, 400)
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return json({ success: false, error: "file 필드가 필요합니다." }, 400)
  }

  if (file.size > MAX_BYTES) {
    return json(
      {
        success: false,
        error: `파일 크기는 ${MAX_BYTES / (1024 * 1024)}MB 이하여야 합니다.`,
      },
      413
    )
  }

  const name = file.name.toLowerCase()
  const isPdf =
    file.type === "application/pdf" ||
    file.type === "application/x-pdf" ||
    name.endsWith(".pdf")
  if (!isPdf) {
    return json({ success: false, error: "PDF 파일만 지원합니다." }, 400)
  }

  const buffer = await file.arrayBuffer()

  let pdfJsText = ""
  let pdfJsMeta = { numPages: 0, pageCharCounts: [] as number[] }
  let pdfJsError: string | null = null

  try {
    const r = await extractTextWithPdfJs(buffer)
    pdfJsText = r.text
    pdfJsMeta = { numPages: r.numPages, pageCharCounts: r.pageCharCounts }
  } catch (e) {
    pdfJsError = e instanceof Error ? e.message : "pdf.js 추출 실패"
  }

  const lowQuality =
    pdfJsError !== null ||
    isPdfJsExtractionLowQuality(pdfJsText, pdfJsMeta)

  if (!lowQuality && pdfJsText.trim()) {
    const text = pdfJsText
    await savePdfExtractionRecord({
      text,
      filename: file.name,
      extractionSource: "pdfjs",
      clientIdentifier: getRequestFingerprint(request),
    })
    return json({ success: true, text, source: "pdfjs" }, 200)
  }

  const pdfJsFallback = pdfJsText.trim()
  const canUsePdfJsFallback = pdfJsFallback.replace(/\s/g, "").length >= 20

  try {
    const { text } = await extractTextWithUnstructured(file)
    if (!text.trim()) {
      if (canUsePdfJsFallback) {
        await savePdfExtractionRecord({
          text: pdfJsFallback,
          filename: file.name,
          extractionSource: "pdfjs",
          clientIdentifier: getRequestFingerprint(request),
        })
        return json(
          { success: true, text: pdfJsFallback, source: "pdfjs" },
          200
        )
      }
      return json(
        {
          success: false,
          error:
            "Unstructured에서도 텍스트를 추출하지 못했습니다. 스캔 PDF는 추후 OCR 지원 예정입니다.",
        },
        422
      )
    }
    await savePdfExtractionRecord({
      text,
      filename: file.name,
      extractionSource: "unstructured",
      clientIdentifier: getRequestFingerprint(request),
    })
    return json({ success: true, text, source: "unstructured" }, 200)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unstructured 추출 실패"
    if (canUsePdfJsFallback) {
      await savePdfExtractionRecord({
        text: pdfJsFallback,
        filename: file.name,
        extractionSource: "pdfjs",
        clientIdentifier: getRequestFingerprint(request),
      })
      return json(
        { success: true, text: pdfJsFallback, source: "pdfjs" },
        200
      )
    }
    if (pdfJsError) {
      return json(
        {
          success: false,
          error: `pdf.js: ${pdfJsError} / Unstructured: ${msg}`,
        },
        502
      )
    }
    return json(
      {
        success: false,
        error: `추출 품질이 낮아 Unstructured로 재시도했으나 실패했습니다. (${msg})`,
      },
      502
    )
  }
}
