import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      server: {
        entry: "server",
      },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
      "entities/lib/decode.js": path.resolve(
        process.cwd(),
        "node_modules/entities/lib/decode.js",
      ),
      "entities/lib/encode.js": path.resolve(
        process.cwd(),
        "node_modules/entities/lib/encode.js",
      ),
      entities: path.resolve(process.cwd(), "node_modules/entities"),
    },
  },
});