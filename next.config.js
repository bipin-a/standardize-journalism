/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/version': ['.VERSION']
  }
}

module.exports = nextConfig
