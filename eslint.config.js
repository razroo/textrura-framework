import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

const browserGlobals = Object.fromEntries([
  'AbortController',
  'CanvasRenderingContext2D',
  'clearInterval',
  'clearTimeout',
  'console',
  'CustomEvent',
  'document',
  'Element',
  'EventSource',
  'fetch',
  'File',
  'FormData',
  'Headers',
  'HTMLCanvasElement',
  'HTMLElement',
  'Image',
  'KeyboardEvent',
  'localStorage',
  'location',
  'MessageEvent',
  'MutationObserver',
  'navigator',
  'performance',
  'PointerEvent',
  'queueMicrotask',
  'requestAnimationFrame',
  'ResizeObserver',
  'Response',
  'setInterval',
  'setTimeout',
  'URL',
  'WebSocket',
  'window',
].map(name => [name, 'readonly']))

const nodeGlobals = Object.fromEntries([
  'Buffer',
  'clearInterval',
  'clearTimeout',
  'console',
  'fetch',
  'process',
  'queueMicrotask',
  'setInterval',
  'setTimeout',
  'structuredClone',
  'URL',
].map(name => [name, 'readonly']))

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': ['error', { destructuring: 'any', ignoreReadBeforeAssign: true }],
    },
  },
  {
    files: ['demo/**/*.ts', 'demos/**/*.ts'],
    languageOptions: {
      globals: { ...browserGlobals, ...nodeGlobals },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...nodeGlobals, ...browserGlobals },
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'dist-demo/**'],
  },
)
