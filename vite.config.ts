import react from "@vitejs/plugin-react-swc";
import externalGlobals from "rollup-plugin-external-globals";
import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Plugin to copy CSS files to dist directory
function copyCSSPlugin() {
  return {
    name: 'copy-css',
    writeBundle() {
      const srcDir = join(process.cwd(), 'src', 'styles');
      const distDir = join(process.cwd(), 'dist', 'styles');
      
      // Create styles directory in dist if it doesn't exist
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }
      
      // Copy CSS files
      try {
        copyFileSync(
          join(srcDir, 'calendar.css'),
          join(distDir, 'calendar.css')
        );
        console.log('✓ CSS files copied to dist/styles/');
      } catch (error) {
        console.error('Error copying CSS files:', error);
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  return {
    define: {
      "process.env": {
        NODE_ENV: JSON.stringify(
          command === "build" ? "production" : "development"
        ),
      },
    },
    build: {
      lib: {
        entry: "src/main.ts",
        fileName: "index",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["react", "valtio"],
      },
    },
    plugins: [
      react(), 
      externalGlobals({ react: "React", valtio: "Valtio" }),
      copyCSSPlugin()
    ],
  };
});
