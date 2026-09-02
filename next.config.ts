import type { NextConfig } from "next";

const securityHeaders = [
  // Phase 4 security review hardening (see docs/SECURITY-REVIEW.md)
  { key: "X-Frame-Options", value: "DENY" }, // clickjacking
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Force HTTPS for 1 year once the browser has seen the site over TLS
  // (no `preload` on purpose — that list is effectively irreversible).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Content-Security-Policy",
    // Razorpay standard checkout needs: its checkout script, its modal iframe
    // (api.razorpay.com) and browser XHR to its API + logging endpoints.
    // Without these the browser silently blocks the gateway for every customer.
    value:
      "default-src 'self'; img-src 'self' data: blob: https://*.razorpay.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com; connect-src 'self' ws: wss: https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com; font-src 'self' data:; frame-src https://api.razorpay.com https://checkout.razorpay.com;",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Type errors now block the build locally AND in CI (.github/workflows/ci.yml
  // runs tsc before build), so shipping broken types to production is no longer
  // possible. Keep this off.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
