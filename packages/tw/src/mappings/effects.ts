import type { TwResult } from '../index.js'

/** Box shadow presets. */
export const effectsMap: Record<string, Partial<TwResult>> = {
  'shadow-sm': { boxShadow: { offsetX: 0, offsetY: 1, blur: 2, color: 'rgba(0,0,0,0.05)' } },
  'shadow': { boxShadow: { offsetX: 0, offsetY: 1, blur: 3, color: 'rgba(0,0,0,0.1)' } },
  'shadow-md': { boxShadow: { offsetX: 0, offsetY: 4, blur: 6, color: 'rgba(0,0,0,0.1)' } },
  'shadow-lg': { boxShadow: { offsetX: 0, offsetY: 10, blur: 15, color: 'rgba(0,0,0,0.1)' } },
  'shadow-xl': { boxShadow: { offsetX: 0, offsetY: 20, blur: 25, color: 'rgba(0,0,0,0.1)' } },
  'shadow-2xl': { boxShadow: { offsetX: 0, offsetY: 25, blur: 50, color: 'rgba(0,0,0,0.25)' } },
  'shadow-none': { boxShadow: { offsetX: 0, offsetY: 0, blur: 0, color: 'rgba(0,0,0,0)' } },
}
