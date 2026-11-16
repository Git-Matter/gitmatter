import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "remotion bundle",
        env: ["NODE_ENV"],
        input: [{ auto: true }, "!build/**"],
        output: ["build/**"],
      },
    },
  },
});
