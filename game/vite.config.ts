import { defineConfig } from "vite";
import fs from 'node:fs';
export default defineConfig({
  plugins:[{name:'room-first-paint',transformIndexHtml(html){
    const runtime=JSON.parse(fs.readFileSync('public/assets/room-runtime.json','utf8'));
    return {html:html.replace('/assets/room-v5.webp',runtime.images.room),tags:[{tag:'link',attrs:{rel:'preload',as:'image',href:runtime.images.room,fetchpriority:'high'},injectTo:'head'}]};
  }}],
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:3103",
      "/room-photo": "http://127.0.0.1:3103",
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("/phaser/") ? "phaser" : undefined,
      },
    },
  },
});
