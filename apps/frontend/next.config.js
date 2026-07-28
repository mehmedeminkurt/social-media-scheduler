/** @type {import('next').NextConfig} */

// next/image optimizer (/_next/image) will fetch ANY host matched here, with no
// auth in front of it — a wildcard turns the server into an open SSRF proxy.
// Restrict it to the storage host we actually render media from.
const remotePatterns = [];
const publicBase = globalThis.process?.env?.S3_PUBLIC_BASE_URL;
if (publicBase) {
  try {
    const parsed = new URL(publicBase);
    remotePatterns.push({
      protocol: parsed.protocol.replace(":", ""),
      hostname: parsed.hostname,
      ...(parsed.port ? { port: parsed.port } : {}),
    });
  } catch {
    // Malformed URL is caught by env validation (lib/env.ts); ignore here.
  }
}

const nextConfig = {
  images: {
    remotePatterns,
  },
};

export default nextConfig;
