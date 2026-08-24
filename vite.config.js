import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "lucide-react": path.resolve(__dirname, "./src/lib/lucideLocal.jsx"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
