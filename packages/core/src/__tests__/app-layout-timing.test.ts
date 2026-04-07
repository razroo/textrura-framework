import { afterEach, describe, it, expect, vi } from 'vitest'
import * as textura from 'textura'
import { createApp } from '../app.js'
import { box, image, scene3d, text } from '../elements.js'
import { clearFocus, focusedElement } from '../focus.js'
import { layoutBoundsAreFinite } from '../layout-bounds.js'
import { readPerformanceNow, safePerformanceNowMs } from '../performance-now.js'
import { signal } from '../signals.js'
import type { HitEvent, Renderer } from '../types.js'

describe('createApp layout direction (Textura computeLayout)', () => {
  it('passes resolved root dir:rtl into layout so flex rows mirror child order', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50 },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('treats root dir:auto as ltr for Yoga (fixed parent context) so flex rows stay left-to-right', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50 },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeLessThan(b!.x)
  })

  it('treats JSON null root dir like auto for Yoga (document-default ltr; flex row left-to-right)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: null as never }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50 },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeLessThan(b!.x)
  })

  it('honors AppOptions.layoutDirection over the root element dir', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'ltr' },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeLessThan(b!.x)
  })

  it('ignores non-ltr/rtl layoutDirection at runtime and derives direction from the root (plain JS / corrupt options)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'auto' as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores boxed-string layoutDirection (Object("ltr")) and derives direction from the root', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: Object('ltr') as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores BigInt layoutDirection (strict equality only) and derives direction from the root', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 0n as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores JSON null layoutDirection and derives direction from the root (parity with other invalid options)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: null as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores empty-string layoutDirection and derives direction from the root (only primitive ltr/rtl win)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: '' as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores uppercase layoutDirection and derives direction from the root dir (only lowercase ltr/rtl override)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'RTL' as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores uppercase layoutDirection when the root omits dir (document default ltr; row stays left-to-right)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'RTL' as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeLessThan(b!.x)
  })

  it('ignores Symbol layoutDirection and derives direction from the root (strict primitive check)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: Symbol('rtl') as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('applies AppOptions.layoutDirection rtl when the root has no explicit dir (document-level RTL)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'rtl' },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('applies AppOptions.layoutDirection rtl when the root dir is auto (document RTL vs inherited ltr on the node)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'rtl' },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('mirrors nested flex rows when a descendant sets dir:rtl (per-node Yoga direction)', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column' }, [
          box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
            box({ width: 30, height: 20 }),
            box({ width: 30, height: 20 }),
          ]),
        ]),
      renderer,
      { width: 100, height: 80 },
    )

    expect(layouts).toHaveLength(1)
    const row = layouts[0]!.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('nested row with unknown dir string inherits ltr owner order (Textura non-ltr/rtl → Yoga Inherit)', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column' }, [
          box(
            { width: 100, height: 40, flexDirection: 'row', gap: 10, dir: 'sideways-lr' as never },
            [box({ width: 30, height: 20 }), box({ width: 30, height: 20 })],
          ),
        ]),
      renderer,
      { width: 100, height: 80 },
    )

    expect(layouts).toHaveLength(1)
    const row = layouts[0]!.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeLessThan(b!.x)
  })

  it('nested row with dir:auto inherits rtl from layoutDirection through a column (Yoga inherit chain)', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column' }, [
          box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
            box({ width: 30, height: 20 }),
            box({ width: 30, height: 20 }),
          ]),
        ]),
      renderer,
      { width: 100, height: 80, layoutDirection: 'rtl' },
    )

    expect(layouts).toHaveLength(1)
    const row = layouts[0]!.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('nested row with dir:auto inherits rtl from explicit root dir:rtl (no AppOptions.layoutDirection)', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column', dir: 'rtl' }, [
          box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
            box({ width: 30, height: 20 }),
            box({ width: 30, height: 20 }),
          ]),
        ]),
      renderer,
      { width: 100, height: 80 },
    )

    expect(layouts).toHaveLength(1)
    const row = layouts[0]!.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('nested row with dir:auto inherits rtl from a non-root rtl ancestor (owner direction stays ltr)', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column' }, [
          box({ width: 100, height: 40, flexDirection: 'column', dir: 'rtl' }, [
            box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
              box({ width: 30, height: 20 }),
              box({ width: 30, height: 20 }),
            ]),
          ]),
        ]),
      renderer,
      { width: 100, height: 80 },
    )

    expect(layouts).toHaveLength(1)
    const wrapper = layouts[0]!.children[0]!
    const row = wrapper.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('nested row with explicit dir:ltr keeps physical left-to-right order under rtl layoutDirection', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column' }, [
          box({ width: 100, height: 40, flexDirection: 'row', gap: 10, dir: 'ltr' }, [
            box({ width: 30, height: 20 }),
            box({ width: 30, height: 20 }),
          ]),
        ]),
      renderer,
      { width: 100, height: 80, layoutDirection: 'rtl' },
    )

    expect(layouts).toHaveLength(1)
    const row = layouts[0]!.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeLessThan(b!.x)
  })

  it('rtl flex row mirrors source order for image, box, and scene3d leaves (Textura treats non-text leaves as flex items)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 200, height: 80, flexDirection: 'row', dir: 'rtl' }, [
          image({ src: '/a.png', width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
          scene3d({ width: 30, height: 20, objects: [] }),
        ]),
      renderer,
      { width: 200, height: 80 },
    )

    expect(layouts).toHaveLength(1)
    const [first, second, third] = layouts[0]!.children
    expect(first!.x).toBeGreaterThan(second!.x)
    expect(second!.x).toBeGreaterThan(third!.x)
  })
})

describe('createApp non-box roots (layout + direction resolution)', () => {
  it('computes finite layout for text, image, and scene3d roots (no flex children)', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        text({
          text: 'hi',
          font: '16px sans-serif',
          lineHeight: 20,
          width: 120,
          height: 24,
          dir: 'rtl',
        }),
      renderer,
      { width: 200, height: 80 },
    )
    expect(renderer.render).toHaveBeenCalledTimes(1)
    const textLayout = renderer.render.mock.calls[0]![0]
    expect(layoutBoundsAreFinite(textLayout)).toBe(true)

    renderer.render.mockClear()
    await createApp(
      () => image({ src: '/x.png', width: 64, height: 48, dir: 'ltr' }),
      renderer,
      { width: 200, height: 80 },
    )
    expect(renderer.render).toHaveBeenCalledTimes(1)
    const imageLayout = renderer.render.mock.calls[0]![0]
    expect(layoutBoundsAreFinite(imageLayout)).toBe(true)

    renderer.render.mockClear()
    await createApp(
      () => scene3d({ width: 80, height: 60, objects: [], dir: 'auto' }),
      renderer,
      { width: 200, height: 80 },
    )
    expect(renderer.render).toHaveBeenCalledTimes(1)
    const sceneLayout = renderer.render.mock.calls[0]![0]
    expect(layoutBoundsAreFinite(sceneLayout)).toBe(true)
  })

  it('passes resolveComputeLayoutDirection into Textura for non-box roots (owner direction from root dir)', async () => {
    const orig = textura.computeLayout.bind(textura)
    const directions: Array<'ltr' | 'rtl'> = []
    const spy = vi.spyOn(textura, 'computeLayout').mockImplementation((tree, opts) => {
      directions.push(opts.direction)
      return orig(tree, opts)
    })
    try {
      const renderer: Renderer = { render: vi.fn(), destroy: vi.fn() }

      await createApp(
        () =>
          text({
            text: 'hi',
            font: '16px sans-serif',
            lineHeight: 20,
            width: 120,
            height: 24,
            dir: 'rtl',
          }),
        renderer,
        { width: 200, height: 80 },
      )

      await createApp(
        () => image({ src: '/x.png', width: 64, height: 48, dir: 'ltr' }),
        renderer,
        { width: 200, height: 80 },
      )

      await createApp(
        () => scene3d({ width: 80, height: 60, objects: [], dir: 'auto' }),
        renderer,
        { width: 200, height: 80 },
      )

      await createApp(
        () => scene3d({ width: 80, height: 60, objects: [], dir: 'rtl' }),
        renderer,
        { width: 200, height: 80 },
      )
    } finally {
      spy.mockRestore()
    }

    expect(directions).toEqual(['rtl', 'ltr', 'ltr', 'rtl'])
  })

  it('honors AppOptions.layoutDirection over non-box root dir for Textura owner direction', async () => {
    const orig = textura.computeLayout.bind(textura)
    const directions: Array<'ltr' | 'rtl'> = []
    const spy = vi.spyOn(textura, 'computeLayout').mockImplementation((tree, opts) => {
      directions.push(opts.direction)
      return orig(tree, opts)
    })
    try {
      const renderer: Renderer = { render: vi.fn(), destroy: vi.fn() }

      await createApp(
        () =>
          text({
            text: 'hi',
            font: '16px sans-serif',
            lineHeight: 20,
            width: 120,
            height: 24,
            dir: 'rtl',
          }),
        renderer,
        { width: 200, height: 80, layoutDirection: 'ltr' },
      )

      await createApp(
        () =>
          text({
            text: 'hi',
            font: '16px sans-serif',
            lineHeight: 20,
            width: 120,
            height: 24,
            dir: 'ltr',
          }),
        renderer,
        { width: 200, height: 80, layoutDirection: 'rtl' },
      )

      await createApp(
        () => image({ src: '/x.png', width: 64, height: 48, dir: 'rtl' }),
        renderer,
        { width: 200, height: 80, layoutDirection: 'ltr' },
      )
    } finally {
      spy.mockRestore()
    }

    expect(directions).toEqual(['ltr', 'rtl', 'ltr'])
  })

  it('exposes the live non-box tree on the app after mount', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () =>
        text({
          text: 'x',
          font: '14px sans-serif',
          lineHeight: 18,
          width: 10,
          height: 18,
        }),
      renderer,
      { width: 100, height: 50 },
    )
    expect(app.tree?.kind).toBe('text')
  })
})

describe('createApp root width/height sanitization', () => {
  it('normalizes signed-zero root extents like +0 (hostile options cannot pass -0 into computeLayout)', async () => {
    const render = vi.fn()
    const renderer: Renderer = { render, destroy: vi.fn() }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: -0,
      height: -0,
    })
    expect(render).toHaveBeenCalledTimes(1)
    const negZeroLayout = render.mock.calls[0]![0] as { width: number; height: number }
    expect(Object.is(negZeroLayout.width, -0)).toBe(false)
    expect(Object.is(negZeroLayout.height, -0)).toBe(false)

    render.mockClear()
    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: 0,
      height: 0,
    })
    expect(render).toHaveBeenCalledTimes(1)
    const zeroLayout = render.mock.calls[0]![0] as { width: number; height: number }
    expect(zeroLayout.width).toBe(negZeroLayout.width)
    expect(zeroLayout.height).toBe(negZeroLayout.height)
  })

  it('omits both root width and height when each axis is invalid (unconstrained computeLayout; still finite geometry)', async () => {
    const render = vi.fn()
    const renderer: Renderer = { render, destroy: vi.fn() }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: Number.NaN,
      height: '50' as unknown as number,
    })
    expect(render).toHaveBeenCalledTimes(1)
    const layout = render.mock.calls[0]![0] as { width: number; height: number }
    expect(Number.isFinite(layout.width)).toBe(true)
    expect(Number.isFinite(layout.height)).toBe(true)
  })

  it('omits NaN, ±Infinity, negative, and non-number root extents so computeLayout stays finite', async () => {
    const render = vi.fn()
    const renderer: Renderer = { render, destroy: vi.fn() }

    for (const badWidth of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      -0.001,
      '100' as unknown as number,
      1n as unknown as number,
      Object(100) as unknown as number,
    ]) {
      render.mockClear()
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
        width: badWidth,
        height: 50,
      })
      expect(render).toHaveBeenCalledTimes(1)
      const layout = render.mock.calls[0]![0] as { width: number; height: number }
      expect(Number.isFinite(layout.width)).toBe(true)
      expect(Number.isFinite(layout.height)).toBe(true)
    }

    for (const badHeight of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      -0.001,
      '50' as unknown as number,
      1n as unknown as number,
      Object(50) as unknown as number,
    ]) {
      render.mockClear()
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
        width: 100,
        height: badHeight,
      })
      expect(render).toHaveBeenCalledTimes(1)
      const layout = render.mock.calls[0]![0] as { width: number; height: number }
      expect(Number.isFinite(layout.width)).toBe(true)
      expect(Number.isFinite(layout.height)).toBe(true)
    }
  })
})

describe('createApp layout timing', () => {
  it('invokes renderer.setFrameTimings with layoutMs before render', async () => {
    const order: string[] = []
    const renderer: Renderer = {
      setFrameTimings(t) {
        order.push(`timings:${t.layoutMs >= 0 ? 'ok' : 'bad'}`)
      },
      render() {
        order.push('render')
      },
      destroy() {},
    }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })

    expect(order).toEqual(['timings:ok', 'render'])
  })

  it('passes non-negative layoutMs', async () => {
    const seen: number[] = []
    const renderer: Renderer = {
      setFrameTimings(t) {
        seen.push(t.layoutMs)
      },
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
    })

    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(seen.every(ms => ms >= 0)).toBe(true)
  })

  it('passes the measured layout delta when performance.now advances monotonically', async () => {
    let step = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
      step++
      return step === 1 ? 1_000 : 1_012.5
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 12.5 })
    } finally {
      spy.mockRestore()
    }
  })

  it('does not require setFrameTimings; render still runs', async () => {
    const render = vi.fn()
    const renderer: Renderer = {
      render,
      destroy: vi.fn(),
    }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
    })

    expect(render).toHaveBeenCalled()
  })

  it('invokes onError when setFrameTimings throws before render; render is skipped on the first frame', async () => {
    const onError = vi.fn()
    const err = new Error('setFrameTimings failed')
    const renderer: Renderer = {
      setFrameTimings() {
        throw err
      },
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(() => box({ width: 10, height: 10 }, []), renderer, {
      width: 100,
      height: 50,
      onError,
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
    expect(renderer.render).not.toHaveBeenCalled()
  })

  it('keeps the last committed tree and layout when setFrameTimings throws during a reactive update', async () => {
    const onError = vi.fn()
    const width = signal(40)
    let timingsCalls = 0
    const renderer: Renderer = {
      setFrameTimings() {
        timingsCalls++
        if (timingsCalls > 1) throw new Error('second timings failed')
      },
      render: vi.fn(),
      destroy: vi.fn(),
    }

    const app = await createApp(() => box({ width: width.value, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
      onError,
    })

    expect(timingsCalls).toBe(1)
    expect(renderer.render).toHaveBeenCalledTimes(1)
    expect((app.tree!.props as { width: number }).width).toBe(40)

    width.set(44)
    expect(timingsCalls).toBe(2)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(renderer.render).toHaveBeenCalledTimes(1)
    expect((app.tree!.props as { width: number }).width).toBe(40)
    expect(app.layout).not.toBeNull()
  })

  it('passes layoutMs 0 for setFrameTimings when global performance is undefined', async () => {
    vi.stubGlobal('performance', undefined)
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }

      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })

      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('passes layoutMs 0 when performance.now is missing or not a function', async () => {
    for (const perf of [{}, { now: 'bad' as unknown as () => number }] as const) {
      vi.stubGlobal('performance', perf)
      try {
        const setFrameTimings = vi.fn()
        const renderer: Renderer = {
          setFrameTimings,
          render: vi.fn(),
          destroy: vi.fn(),
        }
        await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
        expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })

  it('passes layoutMs 0 when performance.now throws or returns non-finite numbers', async () => {
    vi.stubGlobal('performance', {
      now() {
        throw new Error('broken clock')
      },
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      vi.unstubAllGlobals()
    }

    vi.stubGlobal('performance', {
      now: () => Number.NaN,
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('passes layoutMs 0 when globalThis.performance getter throws on access (hostile sealed global)', async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'performance')
    try {
      Object.defineProperty(globalThis, 'performance', {
        configurable: true,
        enumerable: desc?.enumerable ?? true,
        get() {
          throw new Error('performance access denied')
        },
      })
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      if (desc) {
        Object.defineProperty(globalThis, 'performance', desc)
      } else {
        Reflect.deleteProperty(globalThis, 'performance')
      }
    }
  })

  it('clamps negative layout deltas to 0 when performance.now uses negative finite values (hostile polyfill)', async () => {
    let step = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
      step++
      return step === 1 ? -50 : -100
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      spy.mockRestore()
    }
  })

  it('clamps negative or non-finite layout deltas to 0 for setFrameTimings', async () => {
    const mkRenderer = (): Renderer => ({
      setFrameTimings: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn(),
    })

    {
      let step = 0
      const spy = vi.spyOn(performance, 'now').mockImplementation(() => (++step === 1 ? 1000 : 100))
      try {
        const renderer = mkRenderer()
        await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
        expect(renderer.setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
      } finally {
        spy.mockRestore()
      }
    }

    {
      let step = 0
      const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
        step++
        return step === 1 ? 50 : Number.NaN
      })
      try {
        const renderer = mkRenderer()
        await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
        expect(renderer.setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
      } finally {
        spy.mockRestore()
      }
    }

    {
      let step = 0
      const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
        step++
        return step === 1 ? 0 : Number.POSITIVE_INFINITY
      })
      try {
        const renderer = mkRenderer()
        await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
        expect(renderer.setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
      } finally {
        spy.mockRestore()
      }
    }
  })

  it('invokes setFrameTimings on each reactive re-layout when the view depends on a signal', async () => {
    const setFrameTimings = vi.fn()
    const render = vi.fn()
    const renderer: Renderer = {
      setFrameTimings,
      render,
      destroy: vi.fn(),
    }
    const width = signal(40)
    await createApp(() => box({ width: width.value, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
    })

    expect(setFrameTimings).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(1)

    width.set(44)
    expect(setFrameTimings).toHaveBeenCalledTimes(2)
    expect(render).toHaveBeenCalledTimes(2)
    expect(setFrameTimings.mock.calls[1]![0]).toMatchObject({
      layoutMs: expect.any(Number),
    })
    expect(setFrameTimings.mock.calls[1]![0].layoutMs).toBeGreaterThanOrEqual(0)
  })
})

describe('createApp dispatch guards', () => {
  const tabDown = {
    key: 'Tab',
    code: 'Tab',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
  } as const

  it('returns false from dispatch when tree or layout is null', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () => box({ width: 10, height: 10, onClick: () => {} }, []),
      renderer,
      { width: 100, height: 100 },
    )

    const savedTree = app.tree
    const savedLayout = app.layout
    expect(savedTree).not.toBeNull()
    expect(savedLayout).not.toBeNull()

    app.layout = null
    expect(app.dispatch('onClick', 5, 5)).toBe(false)

    app.layout = savedLayout
    app.tree = null
    expect(app.dispatch('onClick', 5, 5)).toBe(false)

    app.tree = savedTree
    app.layout = savedLayout
    expect(app.dispatch('onClick', 5, 5)).toBe(true)
  })

  it('returns false from dispatch when root layout fails layoutBoundsAreFinite (corrupt geometry)', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () => box({ width: 10, height: 10, onClick: () => {} }, []),
      renderer,
      { width: 100, height: 100 },
    )

    const savedLayout = app.layout!
    expect(savedLayout).not.toBeNull()

    app.layout = { ...savedLayout, width: -1 }
    expect(app.dispatch('onClick', 5, 5)).toBe(false)

    app.layout = { ...savedLayout, height: -0.001 }
    expect(app.dispatch('onClick', 5, 5)).toBe(false)

    app.layout = savedLayout
    expect(app.dispatch('onClick', 5, 5)).toBe(true)
  })

  it('forwards optional offsetX and offsetY to dispatchHit for nested surface coordinates', async () => {
    let fired = false
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const child = box({
      width: 40,
      height: 40,
      onClick: () => {
        fired = true
      },
    })
    const app = await createApp(() => box({ width: 100, height: 100 }, [child]), renderer, {
      width: 200,
      height: 200,
    })

    expect(app.dispatch('onClick', 70, 30, undefined, 50, 0)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 70, 30)).toBe(false)
    expect(fired).toBe(false)
  })

  it('forwards optional extra fields to dispatchHit (shallow-merged onto HitEvent)', async () => {
    let received: HitEvent | null = null
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const child = box({
      width: 40,
      height: 40,
      onPointerDown: e => {
        received = e
      },
    })
    const app = await createApp(() => box({ width: 100, height: 100 }, [child]), renderer, {
      width: 200,
      height: 200,
    })

    expect(app.dispatch('onPointerDown', 20, 20, { button: 2, shiftKey: true })).toBe(true)
    expect(received).not.toBeNull()
    expect(received!.x).toBe(20)
    expect(received!.y).toBe(20)
    expect(received!.localX).toBe(20)
    expect(received!.localY).toBe(20)
    const withExtras = received as HitEvent & { button?: number; shiftKey?: boolean }
    expect(withExtras.button).toBe(2)
    expect(withExtras.shiftKey).toBe(true)

    app.destroy()
  })

  it('treats non-finite and non-number dispatch offsets like dispatchHit (finiteNumber)', async () => {
    let fired = false
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const child = box({
      width: 40,
      height: 40,
      onClick: () => {
        fired = true
      },
    })
    const app = await createApp(() => box({ width: 100, height: 100 }, [child]), renderer, {
      width: 200,
      height: 200,
    })

    expect(app.dispatch('onClick', 70, 30, undefined, 50, 0)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 70, 30, undefined, Number.NaN, 0)).toBe(false)
    expect(fired).toBe(false)
    expect(app.dispatch('onClick', 20, 30, undefined, Number.NaN, 0)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 70, 30, undefined, 50n as unknown as number, 0)).toBe(false)
    expect(fired).toBe(false)
    expect(app.dispatch('onClick', 20, 30, undefined, 50n as unknown as number, 0)).toBe(true)
    expect(fired).toBe(true)
  })

  it('treats non-finite and non-number dispatch offsetY like dispatchHit (finiteNumber)', async () => {
    let fired = false
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const child = box({
      width: 40,
      height: 40,
      onClick: () => {
        fired = true
      },
    })
    const app = await createApp(() => box({ width: 100, height: 100 }, [child]), renderer, {
      width: 200,
      height: 200,
    })

    expect(app.dispatch('onClick', 30, 70, undefined, 0, 50)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 30, 70, undefined, 0, Number.NaN)).toBe(false)
    expect(fired).toBe(false)
    expect(app.dispatch('onClick', 30, 20, undefined, 0, Number.NaN)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 30, 70, undefined, 0, 50n as unknown as number)).toBe(false)
    expect(fired).toBe(false)
    expect(app.dispatch('onClick', 30, 20, undefined, 0, 50n as unknown as number)).toBe(true)
    expect(fired).toBe(true)
  })

  it('returns false from dispatch when pointer coordinates are non-finite without click-to-focus', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () => box({ width: 100, height: 100, onKeyDown: () => {}, onClick: () => {} }, []),
      renderer,
      { width: 100, height: 100 },
    )

    clearFocus()
    expect(focusedElement.value).toBeNull()

    expect(app.dispatch('onClick', Number.NaN, 50)).toBe(false)
    expect(focusedElement.value).toBeNull()

    expect(app.dispatch('onClick', 50, Number.POSITIVE_INFINITY)).toBe(false)
    expect(focusedElement.value).toBeNull()

    expect(app.dispatch('onPointerDown', Number.NEGATIVE_INFINITY, 50)).toBe(false)

    expect(app.dispatch('onClick', 50, 50)).toBe(true)
    expect(focusedElement.value).not.toBeNull()
  })

  it('returns false from dispatch when pointer coordinates are non-numbers (matches dispatchHit)', async () => {
    let clicks = 0
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () =>
        box({ width: 100, height: 100, onKeyDown: () => {}, onClick: () => {
          clicks++
        } }, []),
      renderer,
      { width: 100, height: 100 },
    )

    clearFocus()
    expect(focusedElement.value).toBeNull()

    const str50 = '50' as unknown as number
    expect(() => app.dispatch('onClick', str50, 50)).not.toThrow()
    expect(app.dispatch('onClick', str50, 50)).toBe(false)
    expect(clicks).toBe(0)
    expect(focusedElement.value).toBeNull()

    expect(app.dispatch('onClick', 50, str50)).toBe(false)
    expect(clicks).toBe(0)

    const bx = 1n as unknown as number
    expect(() => app.dispatch('onPointerDown', bx, 50)).not.toThrow()
    expect(app.dispatch('onPointerDown', bx, 50)).toBe(false)

    expect(app.dispatch('onClick', 50, 50)).toBe(true)
    expect(clicks).toBe(1)
    expect(focusedElement.value).not.toBeNull()
  })

  it('returns false from dispatchKey and dispatchComposition when tree or layout is null', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () =>
        box({ width: 10, height: 10, onClick: () => {}, onKeyDown: () => {}, onCompositionStart: () => {} }, []),
      renderer,
      { width: 100, height: 100 },
    )

    const savedTree = app.tree
    const savedLayout = app.layout
    expect(savedTree).not.toBeNull()
    expect(savedLayout).not.toBeNull()

    app.layout = null
    expect(app.dispatchKey('onKeyDown', tabDown)).toBe(false)
    expect(app.dispatchComposition('onCompositionStart', { data: '' })).toBe(false)

    app.layout = savedLayout
    app.tree = null
    expect(app.dispatchKey('onKeyDown', tabDown)).toBe(false)
    expect(app.dispatchComposition('onCompositionStart', { data: '' })).toBe(false)
  })
})

describe('createApp destroy', () => {
  it('stops reactive re-layout after destroy so signal updates do not render', async () => {
    const setFrameTimings = vi.fn()
    const render = vi.fn()
    const renderer: Renderer = {
      setFrameTimings,
      render,
      destroy: vi.fn(),
    }
    const width = signal(40)
    const app = await createApp(() => box({ width: width.value, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
    })

    expect(setFrameTimings).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(1)

    app.destroy()

    width.set(99)
    expect(setFrameTimings).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(1)
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('createApp onError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('invokes onError and skips render and setFrameTimings when the view throws during initial update', async () => {
    const onError = vi.fn()
    const render = vi.fn()
    const setFrameTimings = vi.fn()
    const renderer: Renderer = {
      setFrameTimings,
      render,
      destroy: vi.fn(),
    }
    const err = new Error('view failed')
    await createApp(
      () => {
        throw err
      },
      renderer,
      { width: 100, height: 50, onError },
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
    expect(render).not.toHaveBeenCalled()
    expect(setFrameTimings).not.toHaveBeenCalled()
  })

  it('invokes onError and skips render and setFrameTimings when computeLayout throws during initial update', async () => {
    const onError = vi.fn()
    const err = new Error('initial layout failed')
    const spy = vi.spyOn(textura, 'computeLayout').mockImplementation(() => {
      throw err
    })
    try {
      const render = vi.fn()
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render,
        destroy: vi.fn(),
      }
      const app = await createApp(() => box({ width: 10, height: 10 }, []), renderer, {
        width: 100,
        height: 50,
        onError,
      })
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(err)
      expect(render).not.toHaveBeenCalled()
      expect(setFrameTimings).not.toHaveBeenCalled()
      expect(app.tree).toBeNull()
      expect(app.layout).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })

  it('invokes onError when render throws after layout; setFrameTimings runs before render', async () => {
    const onError = vi.fn()
    const err = new Error('render failed')
    const setFrameTimings = vi.fn()
    const renderer: Renderer = {
      setFrameTimings,
      render() {
        throw err
      },
      destroy: vi.fn(),
    }

    const app = await createApp(() => box({ width: 10, height: 10 }, []), renderer, {
      width: 100,
      height: 50,
      onError,
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
    expect(setFrameTimings).toHaveBeenCalledTimes(1)
    expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: expect.any(Number) })
    expect(app.tree).toBeNull()
    expect(app.layout).toBeNull()
  })

  it('keeps the last committed tree and layout when render throws during a reactive update', async () => {
    const onError = vi.fn()
    let paintCount = 0
    const width = signal(40)
    const renderer: Renderer = {
      render: vi.fn((_layout, tree) => {
        paintCount++
        if (paintCount > 1) throw new Error('second paint failed')
        expect((tree.props as { width: number }).width).toBe(40)
      }),
      destroy: vi.fn(),
    }

    const app = await createApp(() => box({ width: width.value, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
      onError,
    })

    expect(paintCount).toBe(1)
    expect((app.tree!.props as { width: number }).width).toBe(40)

    width.set(44)
    expect(paintCount).toBe(2)
    expect(onError).toHaveBeenCalledTimes(1)
    expect((app.tree!.props as { width: number }).width).toBe(40)
    expect(app.layout).not.toBeNull()
  })

  it('keeps the last committed tree and layout when computeLayout throws during a reactive update', async () => {
    const onError = vi.fn()
    const width = signal(40)
    const orig = textura.computeLayout.bind(textura)
    let layoutCalls = 0
    const spy = vi.spyOn(textura, 'computeLayout').mockImplementation((tree, opts) => {
      layoutCalls++
      if (layoutCalls > 1) throw new Error('layout boom')
      return orig(tree, opts)
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      const app = await createApp(() => box({ width: width.value, height: 20 }, []), renderer, {
        width: 100,
        height: 50,
        onError,
      })
      expect(layoutCalls).toBe(1)
      expect(renderer.render).toHaveBeenCalledTimes(1)
      expect(setFrameTimings).toHaveBeenCalledTimes(1)
      expect((app.tree!.props as { width: number }).width).toBe(40)

      width.set(44)
      expect(layoutCalls).toBe(2)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(renderer.render).toHaveBeenCalledTimes(1)
      expect(setFrameTimings).toHaveBeenCalledTimes(1)
      expect((app.tree!.props as { width: number }).width).toBe(40)
    } finally {
      spy.mockRestore()
    }
  })

  it('allows a later manual update after the view first throws', async () => {
    const onError = vi.fn()
    const render = vi.fn()
    const renderer: Renderer = {
      render,
      destroy: vi.fn(),
    }
    let pass = false
    const app = await createApp(
      () => {
        if (!pass) throw new Error('not yet')
        return box({ width: 10, height: 10 }, [])
      },
      renderer,
      { width: 100, height: 50, onError },
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(render).not.toHaveBeenCalled()

    pass = true
    app.update()

    expect(render).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('logs with console.error when the view throws and onError is omitted', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    await createApp(
      () => {
        throw new Error('boom')
      },
      renderer,
      { width: 100, height: 50 },
    )

    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0]![0]).toBe('Geometra render error:')
    expect(spy.mock.calls[0]![1]).toBeInstanceOf(Error)
    expect((spy.mock.calls[0]![1] as Error).message).toBe('boom')
  })
})

describe('createApp waitForFonts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('awaits document.fonts.load for families from the initial view before the reactive effect runs', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })

    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 50 }, [
          text({
            text: 'hi',
            font: '14px CustomFace, sans-serif',
            lineHeight: 20,
            width: 10,
            height: 20,
          }),
        ]),
      renderer,
      { width: 200, height: 100, waitForFonts: true },
    )

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('16px CustomFace')
  })

  it('skips document.fonts.load when the initial view has no loadable custom families', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })

    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 50 }, [
          text({
            text: 'hi',
            font: '14px sans-serif, serif',
            lineHeight: 20,
            width: 10,
            height: 20,
          }),
        ]),
      renderer,
      { width: 200, height: 100, waitForFonts: true },
    )

    expect(load).not.toHaveBeenCalled()
    expect(renderer.render).toHaveBeenCalled()
  })

  it('skips font loading when document.fonts.load is missing so createApp still renders', async () => {
    vi.stubGlobal('document', { fonts: {} })

    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 50 }, [
          text({
            text: 'hi',
            font: '14px CustomFace, sans-serif',
            lineHeight: 20,
            width: 10,
            height: 20,
          }),
        ]),
      renderer,
      { width: 200, height: 100, waitForFonts: true },
    )

    expect(renderer.render).toHaveBeenCalled()
  })

  it('invokes onError and rejects when the view throws during waitForFonts preflight', async () => {
    const onError = vi.fn()
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const err = new Error('preflight view failed')
    await expect(
      createApp(
        () => {
          throw err
        },
        renderer,
        { width: 100, height: 50, waitForFonts: true, onError },
      ),
    ).rejects.toThrow('preflight view failed')

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
    expect(load).not.toHaveBeenCalled()
    expect(renderer.render).not.toHaveBeenCalled()
  })

  it('logs with console.error when the view throws during waitForFonts preflight and onError is omitted', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    await expect(
      createApp(
        () => {
          throw new Error('preflight boom')
        },
        renderer,
        { width: 100, height: 50, waitForFonts: true },
      ),
    ).rejects.toThrow('preflight boom')

    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0]![0]).toBe('Geometra render error:')
    expect(spy.mock.calls[0]![1]).toBeInstanceOf(Error)
    expect((spy.mock.calls[0]![1] as Error).message).toBe('preflight boom')
    expect(load).not.toHaveBeenCalled()
    expect(renderer.render).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('forwards fontLoadTimeoutMs to waitForFonts before the first render', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    try {
      const p = createApp(
        () =>
          box({ width: 100, height: 50 }, [
            text({
              text: 'hi',
              font: '14px SlowFace, sans-serif',
              lineHeight: 20,
              width: 10,
              height: 20,
            }),
          ]),
        renderer,
        { width: 200, height: 100, waitForFonts: true, fontLoadTimeoutMs: 80 },
      )
      await vi.advanceTimersByTimeAsync(79)
      await expect(
        Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
      ).resolves.toBe('not-yet')
      await vi.advanceTimersByTimeAsync(1)
      await p
      expect(load).toHaveBeenCalledWith('16px SlowFace')
      expect(renderer.render).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('treats invalid fontLoadTimeoutMs like waitForFonts (NaN falls back to 10_000 ms)', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    try {
      const p = createApp(
        () =>
          box({ width: 100, height: 50 }, [
            text({
              text: 'hi',
              font: '14px SlowFace, sans-serif',
              lineHeight: 20,
              width: 10,
              height: 20,
            }),
          ]),
        renderer,
        { width: 200, height: 100, waitForFonts: true, fontLoadTimeoutMs: Number.NaN },
      )
      await vi.advanceTimersByTimeAsync(9_999)
      await expect(
        Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
      ).resolves.toBe('not-yet')
      await vi.advanceTimersByTimeAsync(1)
      await p
      expect(load).toHaveBeenCalledWith('16px SlowFace')
      expect(renderer.render).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('treats negative fontLoadTimeoutMs like waitForFonts (falls back to 10_000 ms)', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    try {
      const p = createApp(
        () =>
          box({ width: 100, height: 50 }, [
            text({
              text: 'hi',
              font: '14px SlowFace, sans-serif',
              lineHeight: 20,
              width: 10,
              height: 20,
            }),
          ]),
        renderer,
        { width: 200, height: 100, waitForFonts: true, fontLoadTimeoutMs: -50 },
      )
      await vi.advanceTimersByTimeAsync(9_999)
      await expect(
        Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
      ).resolves.toBe('not-yet')
      await vi.advanceTimersByTimeAsync(1)
      await p
      expect(load).toHaveBeenCalledWith('16px SlowFace')
      expect(renderer.render).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('treats non-finite fontLoadTimeoutMs like waitForFonts (±Infinity falls back to 10_000 ms)', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    try {
      for (const fontLoadTimeoutMs of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const) {
        load.mockClear()
        renderer.render.mockClear()
        const p = createApp(
          () =>
            box({ width: 100, height: 50 }, [
              text({
                text: 'hi',
                font: '14px SlowFace, sans-serif',
                lineHeight: 20,
                width: 10,
                height: 20,
              }),
            ]),
          renderer,
          { width: 200, height: 100, waitForFonts: true, fontLoadTimeoutMs },
        )
        await vi.advanceTimersByTimeAsync(9_999)
        await expect(
          Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
        ).resolves.toBe('not-yet')
        await vi.advanceTimersByTimeAsync(1)
        await p
        expect(load).toHaveBeenCalledWith('16px SlowFace')
        expect(renderer.render).toHaveBeenCalled()
      }
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})

describe('performance now helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('safePerformanceNowMs coerces non-finite now to 0; readPerformanceNow preserves NaN for canvas deltas', () => {
    const spy = vi.spyOn(performance, 'now').mockReturnValue(Number.NaN)
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBeNaN()
    spy.mockRestore()
  })

  it('preserves IEEE negative zero from performance.now (finite; must not collapse to +0)', () => {
    const spy = vi.spyOn(performance, 'now').mockReturnValue(-0)
    expect(Number.isFinite(-0)).toBe(true)
    expect(Object.is(safePerformanceNowMs(), -0)).toBe(true)
    expect(Object.is(readPerformanceNow(), -0)).toBe(true)
    spy.mockRestore()
  })

  it('safePerformanceNowMs and readPerformanceNow return 0 when performance.now throws', () => {
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
      throw new Error('clock')
    })
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(0)
    spy.mockRestore()
  })

  it('safePerformanceNowMs coerces ±Infinity now to 0; readPerformanceNow preserves non-finite values for callers', () => {
    const pos = vi.spyOn(performance, 'now').mockReturnValue(Number.POSITIVE_INFINITY)
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(Number.POSITIVE_INFINITY)
    pos.mockRestore()

    const neg = vi.spyOn(performance, 'now').mockReturnValue(Number.NEGATIVE_INFINITY)
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(Number.NEGATIVE_INFINITY)
    neg.mockRestore()
  })

  it('readPerformanceNow returns 0 when performance.now returns a non-number (hostile polyfill)', () => {
    const str = vi.spyOn(performance, 'now').mockReturnValue('1' as unknown as number)
    expect(readPerformanceNow()).toBe(0)
    str.mockRestore()

    const undef = vi.spyOn(performance, 'now').mockReturnValue(undefined as unknown as number)
    expect(readPerformanceNow()).toBe(0)
    undef.mockRestore()

    const obj = vi.spyOn(performance, 'now').mockReturnValue({} as unknown as number)
    expect(readPerformanceNow()).toBe(0)
    obj.mockRestore()
  })

  it('safePerformanceNowMs and readPerformanceNow return 0 when now returns a symbol (typeof guard)', () => {
    const spy = vi.spyOn(performance, 'now').mockReturnValue(Symbol('t') as unknown as number)
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(0)
    spy.mockRestore()
  })

  it('safePerformanceNowMs and readPerformanceNow return 0 when now returns a boxed number (typeof is object; no ToNumber)', () => {
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => Object(12.5) as unknown as number)
    expect(Number.isFinite(Object(12.5) as unknown as number)).toBe(false)
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(0)
    spy.mockRestore()
  })

  it('safePerformanceNowMs and readPerformanceNow return 0 when now returns bigint (typeof guard; no numeric coercion)', () => {
    const spy = vi.spyOn(performance, 'now').mockReturnValue(1n as unknown as number)
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(0)
    spy.mockRestore()
  })

  it('return 0 when globalThis.performance is undefined or null', () => {
    for (const perf of [undefined, null] as const) {
      vi.stubGlobal('performance', perf as unknown as Performance)
      try {
        expect(safePerformanceNowMs()).toBe(0)
        expect(readPerformanceNow()).toBe(0)
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })

  it('return 0 when performance.now is missing or not a function', () => {
    for (const perf of [
      {},
      { now: 'bad' as unknown as () => number },
      { now: null as unknown as () => number },
    ] as const) {
      vi.stubGlobal('performance', perf as unknown as Performance)
      try {
        expect(safePerformanceNowMs()).toBe(0)
        expect(readPerformanceNow()).toBe(0)
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })

  it('return 0 when globalThis.performance getter throws on access', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'performance')
    try {
      Object.defineProperty(globalThis, 'performance', {
        configurable: true,
        enumerable: desc?.enumerable ?? true,
        get() {
          throw new Error('performance access denied')
        },
      })
      expect(safePerformanceNowMs()).toBe(0)
      expect(readPerformanceNow()).toBe(0)
    } finally {
      if (desc) {
        Object.defineProperty(globalThis, 'performance', desc)
      } else {
        Reflect.deleteProperty(globalThis, 'performance')
      }
    }
  })

  it('treats falsy globalThis.performance like missing (corrupt host / mistaken assignment)', () => {
    for (const perf of [0, false, ''] as const) {
      vi.stubGlobal('performance', perf as unknown as Performance)
      try {
        expect(safePerformanceNowMs()).toBe(0)
        expect(readPerformanceNow()).toBe(0)
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })

  it('return 0 when performance.now is an accessor that throws (typeof invokes the getter)', () => {
    vi.stubGlobal(
      'performance',
      Object.defineProperty({}, 'now', {
        configurable: true,
        enumerable: true,
        get() {
          throw new Error('now access denied')
        },
      }) as unknown as Performance,
    )
    try {
      expect(safePerformanceNowMs()).toBe(0)
      expect(readPerformanceNow()).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
