import { describe, it, expect } from 'vitest'
import { tw } from '../index.js'
import { parseClasses } from '../parser.js'

describe('tw()', () => {
  describe('basic API', () => {
    it('returns empty object for no args', () => {
      expect(tw()).toEqual({})
    })

    it('returns empty object for empty string', () => {
      expect(tw('')).toEqual({})
    })

    it('ignores unknown classes', () => {
      expect(tw('does-not-exist')).toEqual({})
    })

    it('accepts multiple string arguments', () => {
      expect(tw('flex-row', 'p-4')).toEqual({
        flexDirection: 'row',
        padding: 16,
      })
    })

    it('handles extra whitespace', () => {
      expect(tw('  flex-row   p-4  ')).toEqual({
        flexDirection: 'row',
        padding: 16,
      })
    })

    it('ignores non-string runtime arguments (avoids join throwing on Symbol)', () => {
      expect(tw('flex-row', null as unknown as string, 'p-4')).toEqual({
        flexDirection: 'row',
        padding: 16,
      })
      expect(tw('flex-col', undefined as unknown as string)).toEqual({ flexDirection: 'column' })
      expect(tw(0 as unknown as string, 'gap-2')).toEqual({ gap: 8 })
      expect(tw(Symbol('x') as unknown as string, 'p-2')).toEqual({ padding: 8 })
    })

    it('returns empty object when every argument is a non-string', () => {
      expect(tw(null as unknown as string, undefined as unknown as string)).toEqual({})
    })
  })

  describe('parseClasses', () => {
    it('returns empty props for non-string input without throwing', () => {
      expect(parseClasses(null as unknown as string)).toEqual({})
      expect(parseClasses(undefined as unknown as string)).toEqual({})
      expect(parseClasses(1 as unknown as string)).toEqual({})
      expect(parseClasses(Symbol('x') as unknown as string)).toEqual({})
    })

    it('treats whitespace-only input as no tokens (NBSP and newlines included)', () => {
      expect(parseClasses('')).toEqual({})
      expect(parseClasses('   \n\t\u00A0  ')).toEqual({})
      expect(tw('  ', '\t', ' \u00A0 ')).toEqual({})
    })
  })

  describe('layout', () => {
    it('flex-row', () => expect(tw('flex-row')).toEqual({ flexDirection: 'row' }))
    it('flex-col', () => expect(tw('flex-col')).toEqual({ flexDirection: 'column' }))
    it('flex-row-reverse', () => expect(tw('flex-row-reverse')).toEqual({ flexDirection: 'row-reverse' }))
    it('flex-col-reverse', () => expect(tw('flex-col-reverse')).toEqual({ flexDirection: 'column-reverse' }))
    it('hidden', () => expect(tw('hidden')).toEqual({ display: 'none' }))
    it('flex', () => expect(tw('flex')).toEqual({ display: 'flex' }))
    it('relative', () => expect(tw('relative')).toEqual({ position: 'relative' }))
    it('absolute', () => expect(tw('absolute')).toEqual({ position: 'absolute' }))
    it('overflow-hidden', () => expect(tw('overflow-hidden')).toEqual({ overflow: 'hidden' }))
    it('overflow-scroll', () => expect(tw('overflow-scroll')).toEqual({ overflow: 'scroll' }))
    it('ltr', () => expect(tw('ltr')).toEqual({ dir: 'ltr' }))
    it('rtl', () => expect(tw('rtl')).toEqual({ dir: 'rtl' }))
  })

  describe('flex alignment', () => {
    it('justify-center', () => expect(tw('justify-center')).toEqual({ justifyContent: 'center' }))
    it('justify-between', () => expect(tw('justify-between')).toEqual({ justifyContent: 'space-between' }))
    it('items-center', () => expect(tw('items-center')).toEqual({ alignItems: 'center' }))
    it('items-baseline', () => expect(tw('items-baseline')).toEqual({ alignItems: 'baseline' }))
    it('self-stretch', () => expect(tw('self-stretch')).toEqual({ alignSelf: 'stretch' }))
    it('content-evenly', () => expect(tw('content-evenly')).toEqual({ alignContent: 'space-evenly' }))
    it('grow', () => expect(tw('grow')).toEqual({ flexGrow: 1 }))
    it('shrink-0', () => expect(tw('shrink-0')).toEqual({ flexShrink: 0 }))
    it('flex-1', () => expect(tw('flex-1')).toEqual({ flexGrow: 1, flexShrink: 1, flexBasis: 0 }))
    it('flex-none', () => expect(tw('flex-none')).toEqual({ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }))
  })

  describe('gap', () => {
    it('gap-4', () => expect(tw('gap-4')).toEqual({ gap: 16 }))
    it('gap-0', () => expect(tw('gap-0')).toEqual({ gap: 0 }))
    it('gap-x-2', () => expect(tw('gap-x-2')).toEqual({ columnGap: 8 }))
    it('gap-y-8', () => expect(tw('gap-y-8')).toEqual({ rowGap: 32 }))
    it('gap-px', () => expect(tw('gap-px')).toEqual({ gap: 1 }))
  })

  describe('spacing', () => {
    it('p-4', () => expect(tw('p-4')).toEqual({ padding: 16 }))
    it('p-0', () => expect(tw('p-0')).toEqual({ padding: 0 }))
    it('px-2', () => expect(tw('px-2')).toEqual({ paddingHorizontal: 8 }))
    it('py-8', () => expect(tw('py-8')).toEqual({ paddingVertical: 32 }))
    it('pt-4', () => expect(tw('pt-4')).toEqual({ paddingTop: 16 }))
    it('pr-2', () => expect(tw('pr-2')).toEqual({ paddingRight: 8 }))
    it('pb-6', () => expect(tw('pb-6')).toEqual({ paddingBottom: 24 }))
    it('pl-1', () => expect(tw('pl-1')).toEqual({ paddingLeft: 4 }))
    it('p-px', () => expect(tw('p-px')).toEqual({ padding: 1 }))
    it('p-0.5', () => expect(tw('p-0.5')).toEqual({ padding: 2 }))

    it('m-4', () => expect(tw('m-4')).toEqual({ margin: 16 }))
    it('mx-auto', () => expect(tw('mx-auto')).toEqual({ marginLeft: 'auto', marginRight: 'auto' }))
    it('m-auto', () => expect(tw('m-auto')).toEqual({ margin: 'auto' }))
    it('mt-2', () => expect(tw('mt-2')).toEqual({ marginTop: 8 }))

    it('negative margin: -mt-4', () => expect(tw('-mt-4')).toEqual({ marginTop: -16 }))
    it('negative margin: -m-2', () => expect(tw('-m-2')).toEqual({ margin: -8 }))
  })

  describe('sizing', () => {
    it('w-16', () => expect(tw('w-16')).toEqual({ width: 64 }))
    it('w-auto', () => expect(tw('w-auto')).toEqual({ width: 'auto' }))
    it('h-8', () => expect(tw('h-8')).toEqual({ height: 32 }))
    it('h-auto', () => expect(tw('h-auto')).toEqual({ height: 'auto' }))
    it('min-w-0', () => expect(tw('min-w-0')).toEqual({ minWidth: 0 }))
    it('max-w-64', () => expect(tw('max-w-64')).toEqual({ maxWidth: 256 }))
    it('min-h-0', () => expect(tw('min-h-0')).toEqual({ minHeight: 0 }))
    it('max-h-96', () => expect(tw('max-h-96')).toEqual({ maxHeight: 384 }))
    it('aspect-square', () => expect(tw('aspect-square')).toEqual({ aspectRatio: 1 }))
    it('aspect-video', () => expect(tw('aspect-video')).toEqual({ aspectRatio: 16 / 9 }))
  })

  describe('positioning', () => {
    it('top-4', () => expect(tw('top-4')).toEqual({ top: 16 }))
    it('right-0', () => expect(tw('right-0')).toEqual({ right: 0 }))
    it('bottom-8', () => expect(tw('bottom-8')).toEqual({ bottom: 32 }))
    it('left-2', () => expect(tw('left-2')).toEqual({ left: 8 }))
    it('inset-4', () => expect(tw('inset-4')).toEqual({ top: 16, right: 16, bottom: 16, left: 16 }))
    it('-top-2', () => expect(tw('-top-2')).toEqual({ top: -8 }))
  })

  describe('borders', () => {
    it('border', () => expect(tw('border')).toEqual({ borderWidth: 1 }))
    it('border-0', () => expect(tw('border-0')).toEqual({ borderWidth: 0 }))
    it('border-2', () => expect(tw('border-2')).toEqual({ borderWidth: 2 }))
    it('border-4', () => expect(tw('border-4')).toEqual({ borderWidth: 4 }))
    it('border-t-2', () => expect(tw('border-t-2')).toEqual({ borderTop: 2 }))
    it('border-r-4', () => expect(tw('border-r-4')).toEqual({ borderRight: 4 }))
    it('border-b-2', () => expect(tw('border-b-2')).toEqual({ borderBottom: 2 }))
    it('border-l-4', () => expect(tw('border-l-4')).toEqual({ borderLeft: 4 }))

    it('rounded', () => expect(tw('rounded')).toEqual({ borderRadius: 4 }))
    it('rounded-none', () => expect(tw('rounded-none')).toEqual({ borderRadius: 0 }))
    it('rounded-lg', () => expect(tw('rounded-lg')).toEqual({ borderRadius: 8 }))
    it('rounded-full', () => expect(tw('rounded-full')).toEqual({ borderRadius: 9999 }))

    it('border-red-500', () => expect(tw('border-red-500')).toEqual({ borderColor: '#ef4444' }))
    it('border-blue-300', () => expect(tw('border-blue-300')).toEqual({ borderColor: '#93c5fd' }))
  })

  describe('colors', () => {
    it('bg-blue-500', () => expect(tw('bg-blue-500')).toEqual({ backgroundColor: '#3b82f6' }))
    it('bg-white', () => expect(tw('bg-white')).toEqual({ backgroundColor: '#ffffff' }))
    it('bg-black', () => expect(tw('bg-black')).toEqual({ backgroundColor: '#000000' }))
    it('bg-transparent', () => expect(tw('bg-transparent')).toEqual({ backgroundColor: 'transparent' }))
    it('text-gray-900', () => expect(tw('text-gray-900')).toEqual({ color: '#111827' }))
    it('text-white', () => expect(tw('text-white')).toEqual({ color: '#ffffff' }))
  })

  describe('visual', () => {
    it('opacity-50', () => expect(tw('opacity-50')).toEqual({ opacity: 0.5 }))
    it('opacity-100', () => expect(tw('opacity-100')).toEqual({ opacity: 1 }))
    it('opacity-0', () => expect(tw('opacity-0')).toEqual({ opacity: 0 }))
    it('cursor-pointer', () => expect(tw('cursor-pointer')).toEqual({ cursor: 'pointer' }))
    it('cursor-text', () => expect(tw('cursor-text')).toEqual({ cursor: 'text' }))
    it('cursor-not-allowed', () => expect(tw('cursor-not-allowed')).toEqual({ cursor: 'not-allowed' }))
    it('z-10', () => expect(tw('z-10')).toEqual({ zIndex: 10 }))
    it('z-50', () => expect(tw('z-50')).toEqual({ zIndex: 50 }))
    it('pointer-events-none', () => expect(tw('pointer-events-none')).toEqual({ pointerEvents: 'none' }))
    it('pointer-events-auto', () => expect(tw('pointer-events-auto')).toEqual({ pointerEvents: 'auto' }))
  })

  describe('shadows', () => {
    it('shadow', () => {
      expect(tw('shadow')).toEqual({
        boxShadow: { offsetX: 0, offsetY: 1, blur: 3, color: 'rgba(0,0,0,0.1)' },
      })
    })
    it('shadow-lg', () => {
      expect(tw('shadow-lg')).toEqual({
        boxShadow: { offsetX: 0, offsetY: 10, blur: 15, color: 'rgba(0,0,0,0.1)' },
      })
    })
    it('shadow-none', () => {
      expect(tw('shadow-none')).toEqual({
        boxShadow: { offsetX: 0, offsetY: 0, blur: 0, color: 'rgba(0,0,0,0)' },
      })
    })
  })

  describe('arbitrary values', () => {
    it('w-[200]', () => expect(tw('w-[200]')).toEqual({ width: 200 }))
    it('h-[100]', () => expect(tw('h-[100]')).toEqual({ height: 100 }))
    it('p-[13]', () => expect(tw('p-[13]')).toEqual({ padding: 13 }))
    it('bg-[#ff00ff]', () => expect(tw('bg-[#ff00ff]')).toEqual({ backgroundColor: '#ff00ff' }))
    it('text-[#333]', () => expect(tw('text-[#333]')).toEqual({ color: '#333' }))
    it('gap-[10]', () => expect(tw('gap-[10]')).toEqual({ gap: 10 }))
    it('top-[50]', () => expect(tw('top-[50]')).toEqual({ top: 50 }))
    it('z-[999]', () => expect(tw('z-[999]')).toEqual({ zIndex: 999 }))
    it('rounded-[12]', () => expect(tw('rounded-[12]')).toEqual({ borderRadius: 12 }))
    it('opacity-[75]', () => expect(tw('opacity-[75]')).toEqual({ opacity: 0.75 }))
  })

  describe('conflict resolution', () => {
    it('last class wins for same property', () => {
      expect(tw('p-4 p-8')).toEqual({ padding: 32 })
    })

    it('last flex direction wins', () => {
      expect(tw('flex-row flex-col')).toEqual({ flexDirection: 'column' })
    })

    it('inset then override single side', () => {
      expect(tw('inset-4 top-8')).toEqual({ top: 32, right: 16, bottom: 16, left: 16 })
    })

    it('multi-arg conflicts same as single string', () => {
      expect(tw('p-4', 'p-8')).toEqual({ padding: 32 })
    })
  })

  describe('composition', () => {
    it('combines layout + spacing + colors + borders', () => {
      expect(tw('flex-row items-center p-4 bg-blue-500 rounded-lg')).toEqual({
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#3b82f6',
        borderRadius: 8,
      })
    })

    it('complex card-like composition', () => {
      expect(tw('flex-col p-6 gap-4 bg-white rounded-xl shadow-md border border-gray-200')).toEqual({
        flexDirection: 'column',
        padding: 24,
        gap: 16,
        backgroundColor: '#ffffff',
        borderRadius: 12,
        boxShadow: { offsetX: 0, offsetY: 4, blur: 6, color: 'rgba(0,0,0,0.1)' },
        borderWidth: 1,
        borderColor: '#e5e7eb',
      })
    })
  })
})
