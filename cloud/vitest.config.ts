import { defineConfig } from 'vitest/config';
export default defineConfig({ define: { __LOCAL_DEV__: 'true' }, test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
