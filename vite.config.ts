import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(process.env.HTTPS === "true" ? [basicSsl()] : [])],
  server: {
    host: "127.0.0.1",
    watch: { ignored: ["**/test-results/**", "**/playwright-report/**"] },
  },
});
