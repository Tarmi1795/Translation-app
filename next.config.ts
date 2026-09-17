import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Keep pdfjs imports native so the worker module loads and registers
  // globalThis.pdfjsWorker (the fake worker) without bundler rewriting.
  // @napi-rs/canvas supplies DOMMatrix/ImageData/Path2D polyfills and must
  // stay external so its platform binary is used as-is.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // The download route (not the collection) embeds the Arabic font at runtime.
  // PDF extraction runs pdfjs from the server bundle; its legacy build must be
  // traced into the estimates lambda or the worker import fails on Vercel.
  outputFileTracingIncludes: {
    "/api/v1/exports/[id]/download": ["./public/fonts/*.ttf"],
    "/api/v1/estimates": ["./node_modules/pdfjs-dist/legacy/build/**", "./node_modules/@napi-rs/**"],
    "/api/v1/exports": ["./node_modules/pdfjs-dist/legacy/build/**", "./node_modules/@napi-rs/**"],
  },
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
