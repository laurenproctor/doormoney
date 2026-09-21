/*
  Lets `node --test` resolve two things the app's imports assume a bundler for, without adding a
  build step or a dependency. Registered by tests/register.mjs; Node strips the TypeScript itself.

  1. The "@/..." paths, which are a tsconfig path alias.
  3. JSX. Node strips types and stops there, so a .tsx file with markup in it cannot be imported at
     all. The load hook below hands those files to the TypeScript compiler that is already a
     dev dependency and asks for the automatic JSX runtime, which is what Next uses. It touches
     nothing but .tsx under src, so every other test loads exactly as it did.

  2. The "next/..." entry points. Next's package.json maps "./navigation", "./headers" and the
     rest to null on purpose, so plain Node ESM refuses them, while the CJS shim beside them
     resolves fine. A test that mocks one of these still needs the specifier to resolve, because
     node:test keys the mock by its resolved URL.
*/
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A file, not a folder: "@/components/domain" is a folder with an index, and Node will not import a folder. */
const isFile = (candidate) => existsSync(candidate) && statSync(candidate).isFile();

export function resolve(specifier, context, next) {
  if (specifier.startsWith("next/")) {
    const shim = path.join(root, "node_modules", `${specifier}.js`);
    if (existsSync(shim)) return next(pathToFileURL(shim).href, context);
    return next(specifier, context);
  }
  // A relative import between source files leaves its extension off, as a bundler allows.
  if (specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(path.join(root, "src")).href)) {
    const from = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const candidate of [from, `${from}.ts`, `${from}.tsx`, path.join(from, "index.ts")]) {
      if (isFile(candidate)) return next(pathToFileURL(candidate).href, context);
    }
    return next(specifier, context);
  }
  if (!specifier.startsWith("@/")) return next(specifier, context);
  const base = path.join(root, "src", specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (isFile(candidate)) return next(pathToFileURL(candidate).href, context);
  }
  return next(specifier, context);
}

let ts;
export async function load(url, context, next) {
  if (!url.endsWith(".tsx") || !url.startsWith(pathToFileURL(path.join(root, "src")).href)) return next(url, context);
  ts ??= (await import("typescript")).default;
  const source = readFileSync(fileURLToPath(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  });
  return { format: "module", source: outputText, shortCircuit: true };
}
