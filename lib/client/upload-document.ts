"use client"

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

export function isTxtFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return file.type === "text/plain" || n.endsWith(".txt")
}

export function isPdfFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return (
    file.type === "application/pdf" ||
    file.type === "application/x-pdf" ||
    n.endsWith(".pdf")
  )
}

export function validateUploadDocument(
  file: File
): { ok: true } | { ok: false; message: string } {
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `파일 크기는 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB 이하여야 합니다.`,
    }
  }
  if (!isTxtFile(file) && !isPdfFile(file)) {
    return { ok: false, message: ".txt 또는 .pdf 파일만 업로드할 수 있습니다." }
  }
  return { ok: true }
}
