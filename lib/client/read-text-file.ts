"use client"

export function readTextFileWithFileReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      resolve(typeof r === "string" ? r : "")
    }
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"))
    reader.readAsText(file, "UTF-8")
  })
}
