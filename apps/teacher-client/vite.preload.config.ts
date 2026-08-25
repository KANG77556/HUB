import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    outDir: 'dist/electron/preload',
    lib: {
      entry: resolve(import.meta.dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rollupOptions: {
      external: ['electron'],
      output: {
        entryFileNames: 'index.cjs',
        inlineDynamicImports: true,
      },
    },
  },
});
