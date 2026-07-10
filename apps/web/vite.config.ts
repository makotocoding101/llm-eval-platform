import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Dev: forward API calls to the Fastify server.
      // 127.0.0.1 (not localhost) so Windows/Node doesn't resolve to IPv6 ::1 and miss the IPv4 bind.
      "/api": "http://127.0.0.1:3001",
    },
  },
});
