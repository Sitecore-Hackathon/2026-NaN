import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';
import importNewlines from 'eslint-plugin-import-newlines';
import prettierPlugin from 'eslint-plugin-prettier/recommended';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      'import-newlines': importNewlines,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      // 1. Enforce correct import order
      'import/order': [
        'error',
        {
          groups: [
            'builtin', // node:fs, node:path
            'external', // react, next, npm packages
            'internal', // @/ paths
            'parent', // ../
            'sibling', // ./
            'index', // ./index
            'object',
            'type',
          ],
          pathGroups: [
            {
              pattern: 'react',
              group: 'external',
              position: 'before',
            },
            {
              pattern: 'next',
              group: 'external',
              position: 'before',
            },
            {
              pattern: 'next/**',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],

      // 2. Enforce absolute @/ imports over relative ../
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message:
                'Use absolute imports (@/...) instead of relative paths going up directories.',
            },
          ],
        },
      ],

      // 3. No blank lines between import statements within the same group
      'padding-line-between-statements': [
        'error',
        { blankLine: 'never', prev: 'import', next: 'import' },
      ],

      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
        },
      ],
    },
  },
  prettier,
  prettierPlugin,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
