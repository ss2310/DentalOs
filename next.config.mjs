/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @resvg/resvg-js ships a native .node binary — it must stay a runtime
    // require (webpack can't parse binaries). Used by the social image renderer.
    serverComponentsExternalPackages: ["@resvg/resvg-js"],
    // The renderer reads TTFs from assets/fonts at runtime via a variable
    // path — pin them into the traced output so a tracing miss can't 500
    // image rendering in production only.
    outputFileTracingIncludes: {
      "/api/social/render": ["./assets/fonts/**"],
      "/api/capture/compose": ["./assets/fonts/**"],
    },
  },
};

export default nextConfig;
