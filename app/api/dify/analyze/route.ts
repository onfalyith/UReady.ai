import { NextRequest, NextResponse } from "next/server"

import { DifyApiError, analyzePdfWithDifyWorkflow } from "@/lib/dify/workflow"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "file is required (multipart field: file)" },
        { status: 400 }
      )
    }

    const user =
      (form.get("user") as string | null)?.trim() ||
      process.env.DIFY_DEFAULT_USER_ID ||
      "anonymous"

    const fileInputKey =
      (form.get("fileInputKey") as string | null)?.trim() || undefined

    const name = (file.name || "document.pdf").toLowerCase()
    const mime = file.type || ""
    const looksPdf =
      mime === "application/pdf" ||
      mime === "application/x-pdf" ||
      (!mime && name.endsWith(".pdf")) ||
      (mime === "application/octet-stream" && name.endsWith(".pdf"))
    if (!looksPdf) {
      return NextResponse.json(
        {
          ok: false,
          message: "Only PDF files are accepted",
          detail: mime || name,
        },
        { status: 415 }
      )
    }

    const result = await analyzePdfWithDifyWorkflow({
      file,
      filename: file.name || "document.pdf",
      user,
      fileInputKey,
    })

    return NextResponse.json({
      ok: true,
      fileId: result.fileId,
      workflow: result.workflow,
    })
  } catch (e) {
    if (e instanceof DifyApiError) {
      return NextResponse.json(
        {
          ok: false,
          message: e.message,
          detail: e.body,
        },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 }
      )
    }
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
