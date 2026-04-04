import { NextRequest, NextResponse } from "next/server"

import { DifyApiError, runDifyWorkflow } from "@/lib/dify/workflow"

export const runtime = "nodejs"

type AnalyzeTextBody = {
  content?: string
  user?: string
  textInputKey?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeTextBody
    const content = body?.content?.trim()

    if (!content) {
      return NextResponse.json(
        { ok: false, message: "content is required" },
        { status: 400 }
      )
    }

    const user =
      body?.user?.trim() || process.env.DIFY_DEFAULT_USER_ID || "anonymous"
    const textInputKey =
      body?.textInputKey?.trim() ||
      process.env.DIFY_WORKFLOW_TEXT_INPUT_KEY ||
      "content"

    const workflow = await runDifyWorkflow({
      inputs: {
        [textInputKey]: content,
      },
      user,
      responseMode: "blocking",
    })

    return NextResponse.json({
      ok: true,
      workflow,
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

