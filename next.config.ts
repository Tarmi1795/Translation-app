import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Keep pdfjs imports native so the worker module loads and registers
  // globalThis.pdfjsWorker (the fake worker) without bundler rewriting.
  serverExternalPackages: ["pdfjs-dist"],
  // The download route (not the collection) embeds the Arabic font at runtime.
  outputFileTracingIncludes: { "/api/v1/exports/[id]/download": ["./public/fonts/*.ttf"] },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        // SAMEORIGIN (not DENY): the review workspace frames its own PDF
        // preview from /api/v1/exports and /api/v1/projects/[id]/source.
        { key: "X-Frame-Options", value: "SAMEORIGIN" }
      ],
    },
  ],
};

export default withWorkflow(nextConfig);
