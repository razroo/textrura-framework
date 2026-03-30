// Node.js entry point — must be imported instead of '@geometra/core' in Node/Bun.
// Installs OffscreenCanvas polyfill BEFORE textura loads.
import './canvas-polyfill.js'
export * from './index.js'
