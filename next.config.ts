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
  // PDF extraction needs only pdfjs's two legacy modules plus the canvas JS
  // and its linux binary — precise globs keep every function bundle (and the
  // account's Functions Storage, which sums all retained deployments) small.
  outputFileTracingIncludes: {
    "/api/v1/exports/[id]/download": ["./public/fonts/*.ttf"],
    "/api/v1/estimates": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
    ],
    "/api/v1/exports": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Client-side router cache: revisiting a workspace page within the window
    // paints from cache instead of re-rendering on the server. Data that must
    // be fresh (jobs, exports) is fetched by client components separately.
    staleTimes: { dynamic: 90, static: 300 },
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
