import { defineConfig } from "vite";
export default defineConfig({
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
