import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { site } from '@/lib/site'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  openGraph: {
    title: site.name,
    description: site.description,
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="font-sans text-zinc-100 antialiased">{children}</body>
    </html>
  )
}
