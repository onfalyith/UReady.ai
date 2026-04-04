import { NextRequest, NextResponse } from "next/server"

import { extractSourceCandidatesFromText } from "@/lib/source-verification/extract"
import { verifyCitationsExternally } from "@/lib/source-verification/external"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { content?: unknown }
    | null

  const content = typeof body?.content === "string" ? body.content : ""
  if (!content.trim()) {
    return NextResponse.json(
      { ok: false, message: "content is required" },
      { status: 400 }
    )
  }

  const citations = await extractSourceCandidatesFromText(content, {
    maxCandidates: 20,
    useLlm: true,
  })

  const report = await verifyCitationsExternally(citations)

  return NextResponse.json({ ok: true, report })
}

