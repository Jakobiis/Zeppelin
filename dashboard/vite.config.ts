import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwind from "@tailwindcss/vite";

export default defineConfig((configEnv) => {
  return {
    server: {
      port: 3002,
      host: "0.0.0.0",
      allowedHosts: true,
      // Repo is bind-mounted from the Windows host into this Linux container (WSL2) — inotify events for edits
      // made from the host side don't propagate through that mount, so the default watcher silently misses them.
      // Polling instead of relying on those events is what makes HMR actually fire on host-side edits.
      watch: {
        usePolling: true,
        interval: 300,
      },
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // Needed to prevent hardcoded code blocks from breaking in docs
            whitespace: "preserve",
          },
        },
      }),
      tailwind(),
    ],
  };
});
