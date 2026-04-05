import type { TwResult } from '../index.js'

/** Static layout utility classes. */
export const layoutMap: Record<string, Partial<TwResult>> = {
  'flex-row': { flexDirection: 'row' },
  'flex-col': { flexDirection: 'column' },
  'flex-row-reverse': { flexDirection: 'row-reverse' },
  'flex-col-reverse': { flexDirection: 'column-reverse' },

  'flex-wrap': { flexWrap: 'wrap' },
  'flex-nowrap': { flexWrap: 'nowrap' },
  'flex-wrap-reverse': { flexWrap: 'wrap-reverse' },

  'relative': { position: 'relative' },
  'absolute': { position: 'absolute' },

  'hidden': { display: 'none' },
  'flex': { display: 'flex' },

  'overflow-visible': { overflow: 'visible' },
  'overflow-hidden': { overflow: 'hidden' },
  'overflow-scroll': { overflow: 'scroll' },

  'ltr': { dir: 'ltr' },
  'rtl': { dir: 'rtl' },
}
