import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const adapter = pathToFileURL(
  resolve(process.cwd(), "test/acceptance/template-library/harness/storage-adapter.ts")
).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL && specifier.startsWith(".")) {
      const candidate = new URL(specifier, context.parentURL).pathname;
      if (/\/packages\/core\/src\/core\/storage\.(js|ts)$/.test(candidate))
        return { url: adapter, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
