import { defineConfig, loadEnv } from "vite";
import type { PluginOption, ServerOptions } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import safeglloader from "safe-gl/import-glsl/vite";
import aseloader from "import-aseprite/vite";
import path from "path";

export default ({ mode }: { mode: string; }) => {
  const env: any = {
    ...process.env,
    ...loadEnv(mode, process.cwd()),
  };

  let serverOptions: ServerOptions | undefined;
  let addCorsHeaders: PluginOption;
  const apiServerUrl = env.VITE_API_SERVER_URL;
  const apiServerUrl2 = 'https://localjig';
  if (apiServerUrl) {

    console.info(`Proxy server URL: ${apiServerUrl}`);
    const wsServerUrlObj = new URL(apiServerUrl);
    wsServerUrlObj.protocol = wsServerUrlObj.protocol === "http:" ? "ws" : "wss";
    const wsServerUrl = wsServerUrlObj.href;

    serverOptions = {
      port: env.VITE_PORT,
      proxy: {
        "/assets": {
          target: apiServerUrl2,
          secure: false,
          changeOrigin: true,
        },
        "/replays": {
          target: apiServerUrl2,
          secure: false,
          changeOrigin: true,
        },
        "/locales": {
          target: apiServerUrl,
          changeOrigin: true,
        },
        "/stats": apiServerUrl,
        "/modStats": apiServerUrl,
        "/banned": apiServerUrl,
        "/ack": apiServerUrl,
        "/api": {
          target: apiServerUrl,
          changeOrigin: true,
        },
        "/ws": {
          target: wsServerUrl,
          secure: false,
          changeOrigin: true,
          ws: true,
        },
      },
    };
    addCorsHeaders = {
      name: 'add cors headers',
      configureServer: (server) => {
        server.middlewares.use((req, res, next) => {
          // Enables high precision timers
          // for measuring render performance.
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          next();
        });
      }
    };
  }

  return defineConfig({
    worker: {
      format: 'es', // or 'esm'
    },
    resolve: {
      alias: {
        '@framework': path.resolve(__dirname, './src/CubismSdk/Framework/src'),
      },
    },
    optimizeDeps: {
      exclude: ['./src/routes/playground/live2dwrapper.ts']
    },
    plugins: [aseloader({}), sveltekit(), safeglloader(), addCorsHeaders],
    assetsInclude: ["**/*.png", "**/*.bin"],
    server: serverOptions,
  });
};
