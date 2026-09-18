/*
  Lets `node --test` resolve two things the app's imports assume a bundler for, without adding a
  build step or a dependency. Registered by tests/register.mjs; Node strips the TypeScript itself.

  1. The "@/..." paths, which are a tsconfig path alias.
  2. The "next/..." entry points. Next's package.json maps "./navigation", "./headers" and the
     rest to null on purpose, so plain Node ESM refuses them, while the CJS shim beside them
     resolves fine. A test that mocks one of these still needs the specifier to resolve, because
     node:test keys the mock by its resolved URL.
*/
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function resolve(specifier, context, next) {
  if (specifier.startsWith("next/")) {
    const shim = path.join(root, "node_modules", `${specifier}.js`);
    if (existsSync(shim)) return next(pathToFileURL(shim).href, context);
    return next(specifier, context);
  }
  if (!specifier.startsWith("@/")) return next(specifier, context);
  const base = path.join(root, "src", specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
  }
  return next(specifier, context);
}
