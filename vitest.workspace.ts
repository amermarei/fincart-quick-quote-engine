import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = __dirname;

export default defineWorkspace([
  {
    test: {
      name: 'shared',
      environment: 'node',
      include: ['packages/shared/**/*.spec.ts'],
    },
  },
  {
    test: {
      name: 'api',
      environment: 'node',
      include: ['apps/api/src/**/*.spec.ts', 'apps/api/test/**/*.e2e.ts'],
      setupFiles: ['apps/api/test/setup.ts'],
      fileParallelism: false,
      pool: 'forks',
      poolOptions: {
        forks: { singleFork: true },
      },
      resolve: {
        alias: {
          '@qqe/shared': resolve(root, 'packages/shared/src/index.ts'),
          '@qqe/vendors': resolve(root, 'packages/vendors/index.ts'),
        },
      },
    },
  },
  {
    test: {
      name: 'web',
      environment: 'jsdom',
      include: ['apps/web/tests/**/*.test.tsx'],
      setupFiles: ['apps/web/tests/setup.ts'],
      resolve: {
        alias: {
          '@qqe/shared': resolve(root, 'packages/shared/src/index.ts'),
        },
      },
      plugins: [react()],
    },
  },
]);