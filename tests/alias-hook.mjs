/*
  Lets `node --test` resolve the "@/..." paths the app uses, without adding a build step or a
  dependency. Registered by tests/register.mjs; Node strips the TypeScript itself.
*/
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function resolve(specifier, context, next) {
  if (!specifier.startsWith("@/")) return next(specifier, context);
  const base = path.join(root, "src", specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
  }
  return next(specifier, context);
}
