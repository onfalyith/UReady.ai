import "server-only"

const DEFAULT_BASE_URL = "https://api.dify.ai/v1"

export class DifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message)
    this.name = "DifyApiError"
  }
}

export type DifyFileUploadResponse = {
  id: string
  name: string
  size: number
  extension?: string | null
  mime_type?: string | null
  created_at?: number
}

/** File input for workflow `inputs` (file-type variable) */
export type DifyWorkflowFileInput = {
  type: "document" | "image" | "audio" | "video" | "custom"
  transfer_method: "local_file"
  upload_file_id: string
}

export type DifyWorkflowRunResponse = {
  workflow_run_id?: string
  task_id?: string
  data?: {
    id?: string
    workflow_id?: string
    status?: string
    outputs?: Record<string, unknown>
    error?: string | null
    elapsed_time?: number
    total_tokens?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

function getDifyConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.DIFY_API_KEY
  if (!apiKey) {
    throw new Error("DIFY_API_KEY is not set")
  }
  const baseUrl = (
    process.env.DIFY_API_BASE_URL ?? DEFAULT_BASE_URL
  ).replace(/\/$/, "")
  return { apiKey, baseUrl }
}

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` }
}

/**
 * POST /files/upload — multipart: file + user (must match workflow run user).
 */
export async function uploadFileToDify(
  file: Blob,
  filename: string,
  user: string
): Promise<DifyFileUploadResponse> {
  const { apiKey, baseUrl } = getDifyConfig()
  const form = new FormData()
  form.append("file", file, filename)
  form.append("user", user)

  const res = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: form,
  })

  const text = await res.text()
  if (!res.ok) {
    throw new DifyApiError(
      `Dify file upload failed: ${res.status}`,
      res.status,
      text
    )
  }
  return JSON.parse(text) as DifyFileUploadResponse
}

export type RunWorkflowOptions = {
  inputs: Record<string, unknown>
  user: string
  responseMode?: "blocking" | "streaming"
}

/**
 * POST /workflows/run
 */
export async function runDifyWorkflow(
  options: RunWorkflowOptions
): Promise<DifyWorkflowRunResponse> {
  const { apiKey, baseUrl } = getDifyConfig()
  const body = {
    inputs: options.inputs,
    response_mode: options.responseMode ?? "blocking",
    user: options.user,
  }

  const res = await fetch(`${baseUrl}/workflows/run`, {
    method: "POST",
    headers: {
      ...authHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new DifyApiError(
      `Dify workflow run failed: ${res.status}`,
      res.status,
      text
    )
  }
  return JSON.parse(text) as DifyWorkflowRunResponse
}

export type AnalyzePdfWithWorkflowOptions = {
  file: Blob
  filename: string
  /** End-user id; upload와 workflow 실행에 동일하게 사용 */
  user: string
  /**
   * Dify 워크플로에서 파일을 받는 입력 변수 이름 (예: pdf, document)
   * 미지정 시 DIFY_WORKFLOW_FILE_INPUT_KEY 또는 "pdf"
   */
  fileInputKey?: string
  /** PDF 등 문서는 보통 document */
  fileType?: DifyWorkflowFileInput["type"]
  /** 파일 외 추가 입력값 */
  extraInputs?: Record<string, unknown>
  responseMode?: "blocking" | "streaming"
}

export type AnalyzePdfWorkflowResult = {
  /** /files/upload 응답의 id (워크플로 입력의 upload_file_id) */
  fileId: string
  upload: DifyFileUploadResponse
  workflow: DifyWorkflowRunResponse
}

/**
 * 1) /files/upload 로 file_id 확보
 * 2) /workflows/run 에 upload_file_id 를 넣어 실행
 */
export async function analyzePdfWithDifyWorkflow(
  options: AnalyzePdfWithWorkflowOptions
): Promise<AnalyzePdfWorkflowResult> {
  const upload = await uploadFileToDify(
    options.file,
    options.filename,
    options.user
  )

  const inputKey =
    options.fileInputKey ??
    process.env.DIFY_WORKFLOW_FILE_INPUT_KEY ??
    "pdf"

  const fileType: DifyWorkflowFileInput["type"] =
    options.fileType ??
    (process.env.DIFY_WORKFLOW_FILE_TYPE as DifyWorkflowFileInput["type"]) ??
    "document"

  const fileInput: DifyWorkflowFileInput = {
    type: fileType,
    transfer_method: "local_file",
    upload_file_id: upload.id,
  }

  const inputs: Record<string, unknown> = {
    ...(options.extraInputs ?? {}),
    [inputKey]: [fileInput],
  }

  const workflow = await runDifyWorkflow({
    inputs,
    user: options.user,
    responseMode: options.responseMode,
  })

  return {
    fileId: upload.id,
    upload,
    workflow,
  }
}
