// @ts-check
// eslint.config.js

// ESLint flat config for this TypeScript ESM plugin. Trimmed from the Matterbridge plugin
// template to the plugins actually used here (no JSON/Markdown/Vitest linting).

import path from 'node:path';
import url from 'node:url';

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import jest from 'eslint-plugin-jest';
import jsdoc from 'eslint-plugin-jsdoc';
import n from 'eslint-plugin-n';
import prettier from 'eslint-plugin-prettier';
import importsort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,mjs,cjs,ts,mts,cts}'];
const typescriptFiles = ['**/src/**/*.{ts,mts,cts}', '**/test/**/*.{ts,mts,cts}'];
const jestTestFiles = ['**/test/**/*.spec.{ts,mts,cts}', '**/test/**/*.test.{ts,mts,cts}'];
const configDirname = path.dirname(url.fileURLToPath(import.meta.url));

export default defineConfig([
  {
    name: 'Global Ignores',
    ignores: ['**/.cache', '**/build', '**/coverage', '**/dist', '**/jest', '**/node_modules', '**/temp', '**/vendor'],
  },
  {
    name: 'JavaScript & TypeScript Source Files',
    files: sourceFiles,
    plugins: {
      n,
      jsdoc,
      'simple-import-sort': importsort,
      prettier,
    },
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
    extends: [js.configs.recommended, n.configs['flat/recommended-module'], jsdoc.configs['flat/recommended']],
    rules: {
      'no-console': 'warn',
      'spaced-comment': ['error', 'always'],
      'require-await': 'off',
      'n/prefer-node-protocol': 'error',
      'n/no-unsupported-features/node-builtins': ['error', { ignores: ['fetch'] }],
      'n/no-extraneous-import': ['error', { allowModules: ['matterbridge'] }],
      'n/no-missing-import': 'off', // resolved by TypeScript / nodenext .js specifiers
      'n/no-unpublished-import': 'off',
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1, endLines: 0 }],
      'jsdoc/check-tag-names': ['warn', { definedTags: ['created', 'contributor', 'remarks'] }],
      'jsdoc/no-undefined-types': 'off',
      'simple-import-sort/imports': ['warn'],
      'simple-import-sort/exports': ['warn'],
      'prettier/prettier': 'warn',
    },
  },
  {
    name: 'TypeScript Source Files',
    files: typescriptFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: configDirname,
        project: 'tsconfig.json',
      },
    },
    extends: [...tseslint.configs.strict],
    rules: {
      'no-redeclare': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/promise-function-async': 'warn',
      '@typescript-eslint/require-await': 'warn',
    },
  },
  {
    name: 'Jest Test Files',
    files: jestTestFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: configDirname,
        project: 'tsconfig.json',
      },
    },
    extends: [jest.configs['flat/recommended']],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'n/no-extraneous-import': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
    },
  },
]);
