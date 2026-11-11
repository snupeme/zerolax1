// Node 24+ local fallback when tsx cannot query the OS user in a managed shell.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workspace = new URL('../', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(error.code) ||
          !context.parentURL?.startsWith(workspace) || context.parentURL.includes('/node_modules/') ||
          !specifier.startsWith('.')) throw error;
      for (const suffix of ['.ts', '/index.ts']) {
        const candidate = new URL(specifier + suffix, context.parentURL);
        if (candidate.href.startsWith(workspace) && existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      throw error;
    }
  },
});
