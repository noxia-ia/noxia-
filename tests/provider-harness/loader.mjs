import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../src");

const tryExt = (p) =>
  ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
    .map((e) => p + e)
    .find((f) => fs.existsSync(f) && fs.statSync(f).isFile());

export async function resolve(spec, ctx, next) {
  if (spec === "server-only") {
    return {
      url: pathToFileURL(path.join(HERE, "stubs/empty.mjs")).href,
      shortCircuit: true,
    };
  }

  if (spec === "@supabase/supabase-js") {
    return {
      url: pathToFileURL(path.join(HERE, "stubs/supabase.mjs")).href,
      shortCircuit: true,
    };
  }

  if (spec === "@fal-ai/client") {
    return {
      url: pathToFileURL(path.join(HERE, "stubs/fal-ai-client.mjs")).href,
      shortCircuit: true,
    };
  }

  let file;

  if (spec.startsWith("@/")) {
    file = tryExt(path.join(SRC, spec.slice(2)));
  } else if (spec.startsWith(".") && ctx.parentURL?.startsWith("file:")) {
    file = tryExt(
      path.resolve(
        path.dirname(fileURLToPath(ctx.parentURL)),
        spec
      )
    );
  }

  if (file) {
    return {
      url: pathToFileURL(file).href,
      shortCircuit: true,
    };
  }

  return next(spec, ctx);
}
