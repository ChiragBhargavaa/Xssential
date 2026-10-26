import type { NextConfig } from 'next'

// The site is exported as static HTML so it can be hosted anywhere
// (GitHub Pages, Vercel, Netlify, Cloudflare Pages...).
// On GitHub Pages project sites the workflow sets PAGES_BASE_PATH to "/<repo>".
const basePath = process.env.PAGES_BASE_PATH || ''

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default nextConfig
