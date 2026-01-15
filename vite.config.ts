import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import viteSolid from "vite-plugin-solid";
import tsConfigPaths from "vite-tsconfig-paths";

// Vite base path for correct asset + router paths.
// - Local dev: '/' (default)
// - GitHub Pages prod: '/where-to-eat/' (set via VITE_BASE in CI)
// - PR previews: '/where-to-eat/previews/pr-<num>/' (set via VITE_BASE in CI)
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    port: 3000,
    proxy: {},
  },
  preview: {
    port: 3000,
  },
  plugins: [
    tailwindcss(),
    // basicSsl(), // Disabled for build - causes self-signed cert issues with prerendering
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    TanStackRouterVite({
      target: "solid",
      autoCodeSplitting: true,
    }),
    viteSolid(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "favicon.ico",
        "favicon.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "icon-dark-192x192.png",
      ],
      manifest: {
        name: "Where to Eat",
        short_name: "EateryWheel",
        description:
          "Collaboratively choose where to eat with a spinning wheel",
        start_url: base,
        scope: base,
        theme_color: "#000000",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "icon-light-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-light-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-light-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "screenshots/mobile.png",
            sizes: "390x844",
            type: "image/png",
          },
          {
            src: "screenshots/desktop.png",
            sizes: "1280x800",
            type: "image/png",
            form_factor: "wide",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
        suppressWarnings: true,
      },
    }),
  ],
});
