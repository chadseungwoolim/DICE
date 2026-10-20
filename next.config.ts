import type { NextConfig } from "next";

// APP_BUILD=1 (scripts/build-app.mjs): static export for the Capacitor app.
const app = process.env.APP_BUILD === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(app
    ? { output: "export", trailingSlash: true, images: { unoptimized: true } }
    : {
        async headers() {
          return [
            {
              // CORS is needed because the Capacitor app (origin https://localhost) fetches the model weights from here.
              source: "/models/:path*",
              headers: [
                { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
                { key: "Access-Control-Allow-Origin", value: "*" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
