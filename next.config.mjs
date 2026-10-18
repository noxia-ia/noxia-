/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// Développement local avec les services Cloudflare (npm run dev). Sans effet en production ; ignoré si le paquet n'est pas installé.
if (process.env.NODE_ENV === "development") {
  try {
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    initOpenNextCloudflareForDev();
  } catch { /* @opennextjs/cloudflare non installé : développement classique */ }
}

export default nextConfig;
