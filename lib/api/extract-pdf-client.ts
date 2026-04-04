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
