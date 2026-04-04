"use client"

import type { SourceVerificationReport } from "@/lib/types"

export async function verifySourcesViaApi(content: string) {
  const res = await fetch("/api/sources/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })

  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    const message = json?.message ?? `verify failed (${res.status})`
    throw new Error(message)
  }

  return json.report as SourceVerificationReport
}

