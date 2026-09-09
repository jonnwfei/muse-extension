import { build } from "esbuild";
import { cpSync } from "node:fs";

await build({
  entryPoints: ["src/background.ts", "src/contentscript.ts", "src/popup.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  outdir: "dist",
});

cpSync("public", "dist", { recursive: true });
