import type { NextConfig } from 'next'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  output: 'standalone',
}

export default nextConfig
