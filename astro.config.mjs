// @ts-check
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import comparatorPwa from "./scripts/comparator-pwa.mjs";
import sitemaps from './scripts/sitemaps.mjs';
import { existsSync } from 'node:fs';
import { resolveBibleSource } from './src/lib/bible-source.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
// Pin the absolute path: Node may be started outside the repository directory.
const bibleSource = resolveBibleSource();

// https://astro.build/config
export default defineConfig({
  integrations: [svelte(), comparatorPwa(), sitemaps({
    mainOrigin: process.env.PUBLIC_MAIN_SITE_URL || 'https://literae.ch',
    artOrigin: process.env.PUBLIC_ART_SITE_URL || 'https://art.literae.ch',
  })],
  // Toutes les routes sont prérendues, sauf l’unique endpoint SQLite du comparateur.
  output: "static",
  trailingSlash: 'never',
  adapter: node({ mode: "standalone" }),
  redirects: {
    "/comparateur": "/scriptorium/comparateur",
  },
  vite: {
    define: { __LITERAE_BIBLE_SOURCE__: JSON.stringify(bibleSource) },
    plugins: [tailwindcss()],
    // The dedicated worker must share the PWA scope to fetch WASM offline.
    worker: {
      rolldownOptions: { output: { entryFileNames: "scriptorium/bible-worker-[hash].js" } },
    },
    server: {
      proxy: { '/art-media': 'http://127.0.0.1:4392' },
      watch: {
        ignored: [
          "**/data/**",
          "**/*.db",
          "**/*.db-wal",
          "**/*.db-shm",
          "**/*.db-journal",
        ],
      },
    },
  },
});
