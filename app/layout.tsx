import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'UReady.ai — 발표 허점 스캐너',
  description:
    'AI가 생성한 환각과 논리적 취약점을 빠르게 찾아 발표를 준비하세요.',
  generator: 'v0.app',
  keywords: ['발표', 'AI', '논리', '허점', '대학생', '과제', '프레젠테이션'],
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#d32d2f' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a2e' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
