import type { Metadata } from 'next'
// import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

// const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'HY-007 Vault - Leveraged Yield Strategy',
  description: 'One-click leveraged deposits on HypurrFi managed by HY-007 agent',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
      //  className={inter.className}
       >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
