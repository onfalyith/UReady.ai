import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { AppLegalFooter } from '@/components/app-legal-footer'
import './globals.css'

/** Maze — universal snippet (loads maze-universal-loader.js) */
const MAZE_UNIVERSAL_SNIPPET = `(function (m, a, z, e) {
  var s, t, u, v;
  try {
    t = m.sessionStorage.getItem('maze-us');
  } catch (err) {}

  if (!t) {
    t = new Date().getTime();
    try {
      m.sessionStorage.setItem('maze-us', t);
    } catch (err) {}
  }

  u = document.currentScript || (function () {
    var w = document.getElementsByTagName('script');
    return w[w.length - 1];
  })();
  v = u && u.nonce;

  s = a.createElement('script');
  s.src = z + '?apiKey=' + e;
  s.async = true;
  if (v) s.setAttribute('nonce', v);
  a.getElementsByTagName('head')[0].appendChild(s);
  m.mazeUniversalSnippetApiKey = e;
})(window, document, 'https://snippet.maze.co/maze-universal-loader.js', '79ae1e51-1edd-4651-bf65-7e309749906f');`

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
        <Script
          id="maze-universal-snippet"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: MAZE_UNIVERSAL_SNIPPET }}
        />
        {children}
        <AppLegalFooter />
        <Analytics />
      </body>
    </html>
  )
}
