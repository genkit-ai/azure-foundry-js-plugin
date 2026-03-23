import { defineConfig } from 'tsup';

export default defineConfig({
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  shims: true,
  outDir: 'lib',
  entry: ['src/**/*.ts'],
  bundle: false,
  treeshake: false,
});
