/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @resvg/resvg-js ships a native .node binary — it must stay a runtime
    // require (webpack can't parse binaries). Used by the social image renderer.
    serverComponentsExternalPackages: ["@resvg/resvg-js"],
  },
};

export default nextConfig;
