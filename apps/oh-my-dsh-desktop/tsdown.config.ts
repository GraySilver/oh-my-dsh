import { defineConfig } from 'tsdown'

/** Bundle Electron's main process without bundling the product runtime dependency. */
export default defineConfig({
  entry: ['src/main.ts', 'src/preload.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: true,
  external: ['electron', '@graysilver/oh-my-dsh'],
})
