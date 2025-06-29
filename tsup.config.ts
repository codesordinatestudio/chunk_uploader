import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@octokit/oauth-app", "@octokit/rest", "googleapis", "jsonwebtoken"],
  treeshake: true,
  splitting: false,
  minify: true,
});
