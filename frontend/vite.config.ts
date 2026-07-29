import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Fuerza un chunk propio para todo el bloque de autenticación (SDK de
        // Firebase + nuestro código en features/auth/): sin esto, el bundler
        // (Rolldown) pierde el código real de `firebase/app`/`firebase/auth`
        // cuando el mismo módulo es alcanzable a la vez desde un import
        // estático (AuthProvider global en main.tsx) y desde varios imports
        // dinámicos (páginas lazy que usan useAuth) — ver docs/DECISIONS.md.
        manualChunks(id) {
          if (
            id.includes("node_modules/firebase") ||
            id.includes("node_modules/@firebase") ||
            id.includes("/src/features/auth/")
          ) {
            return "auth-vendor";
          }
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
