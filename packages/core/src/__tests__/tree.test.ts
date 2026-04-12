import { describe, it, expect } from 'vitest'
import { toLayoutTree } from '../tree.js'
import { ambientLight, box, image, scene3d, sphere, text } from '../elements.js'
import type { UIElement } from '../types.js'

type BoxLayoutNode = ReturnType<typeof toLayoutTree> & { children: Array<Record<string, unknown>> }

describe('toLayoutTree', () => {
  it('strips backgroundColor, color, borderColor, borderRadius, borderWidth, opacity from box', () => {
    const el = box({
      width: 100,
      height: 50,
      backgroundColor: '#fff',
      color: '#000',
      borderColor: '#ccc',
      borderRadius: 8,
      borderWidth: 1,
      opacity: 0.5,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).toHaveProperty('height', 50)
    expect(layout).not.toHaveProperty('backgroundColor')
    expect(layout).not.toHaveProperty('color')
    expect(layout).not.toHaveProperty('borderColor')
    expect(layout).not.toHaveProperty('borderRadius')
    expect(layout).not.toHaveProperty('borderWidth')
    expect(layout).not.toHaveProperty('opacity')
  })

  it('strips selectable from text', () => {
    const el = text({
      text: 'Hello',
      font: '14px sans-serif',
      lineHeight: 18,
      selectable: true,
      width: 100,
      height: 18,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('selectable')
  })

  it('preserves whiteSpace on text for Yoga/Textura layout', () => {
    const el = text({
      text: 'a\nb',
      font: '14px sans-serif',
      lineHeight: 18,
      whiteSpace: 'pre-wrap',
      width: 100,
      height: 36,
    })
    const layout = toLayoutTree(el)
    expect(layout).toMatchObject({
      text: 'a\nb',
      whiteSpace: 'pre-wrap',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 100,
      height: 36,
    })
  })

  it('strips paint and hit-target style props from text leaves (same strip list as boxes)', () => {
    const el = text({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 40,
      height: 18,
      color: '#333',
      backgroundColor: '#eee',
      borderColor: '#ccc',
      borderRadius: 2,
      borderWidth: 1,
      opacity: 0.9,
      cursor: 'text',
      pointerEvents: 'none',
      zIndex: 3,
      overflow: 'hidden',
      scrollX: 1,
      scrollY: 2,
      boxShadow: { offsetX: 0, offsetY: 1, blur: 2, color: '#000' },
      gradient: { type: 'linear', stops: [{ offset: 0, color: '#fff' }] },
      dir: 'rtl',
    })
    const layout = toLayoutTree(el)
    expect(layout).toMatchObject({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 40,
      height: 18,
    })
    for (const k of [
      'color',
      'backgroundColor',
      'borderColor',
      'borderRadius',
      'borderWidth',
      'opacity',
      'cursor',
      'pointerEvents',
      'zIndex',
      'overflow',
      'scrollX',
      'scrollY',
      'boxShadow',
      'gradient',
      'dir',
      'selectable',
    ] as const) {
      expect(layout).not.toHaveProperty(k)
    }
  })

  it('strips selectable from box, image, and scene3d when the key appears on props (e.g. corrupt serialization)', () => {
    const b = box({ width: 10, height: 10, selectable: true } as unknown as Parameters<typeof box>[0])
    expect(toLayoutTree(b)).not.toHaveProperty('selectable')

    const img = image({
      src: 'x.png',
      width: 8,
      height: 8,
      selectable: false,
    } as unknown as Parameters<typeof image>[0])
    expect(toLayoutTree(img)).not.toHaveProperty('selectable')

    const sc = scene3d({
      width: 16,
      height: 16,
      objects: [sphere({ radius: 1 })],
      selectable: true,
    } as unknown as Parameters<typeof scene3d>[0])
    expect(toLayoutTree(sc)).not.toHaveProperty('selectable')
  })

  it('preserves flexDirection, padding, gap', () => {
    const el = box({
      width: 200,
      height: 200,
      flexDirection: 'row',
      padding: 10,
      gap: 8,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('flexDirection', 'row')
    expect(layout).toHaveProperty('padding', 10)
    expect(layout).toHaveProperty('gap', 8)
  })

  it('preserves flex sizing and alignment props for Textura (grow/shrink/basis, min/max, aspect ratio)', () => {
    const el = box({
      width: 200,
      height: 100,
      flexGrow: 1,
      flexShrink: 2,
      flexBasis: 0,
      minWidth: 40,
      maxWidth: 180,
      minHeight: 10,
      maxHeight: 90,
      aspectRatio: 2,
      justifyContent: 'space-between',
      alignItems: 'center',
      alignSelf: 'flex-end',
      flexWrap: 'wrap',
      alignContent: 'stretch',
      rowGap: 4,
      columnGap: 6,
    })
    const layout = toLayoutTree(el)
    expect(layout).toMatchObject({
      width: 200,
      height: 100,
      flexGrow: 1,
      flexShrink: 2,
      flexBasis: 0,
      minWidth: 40,
      maxWidth: 180,
      minHeight: 10,
      maxHeight: 90,
      aspectRatio: 2,
      justifyContent: 'space-between',
      alignItems: 'center',
      alignSelf: 'flex-end',
      flexWrap: 'wrap',
      alignContent: 'stretch',
      rowGap: 4,
      columnGap: 6,
    })
  })

  it('preserves display for Textura/Yoga on boxes and non-box leaves (layout visibility, not paint-only metadata)', () => {
    const none = box({ width: 100, height: 50, display: 'none' })
    expect(toLayoutTree(none)).toMatchObject({ width: 100, height: 50, display: 'none' })

    const flex = box({ width: 40, height: 40, display: 'flex' })
    expect(toLayoutTree(flex)).toMatchObject({ width: 40, height: 40, display: 'flex' })

    const t = text({
      text: 'hi',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 10,
      height: 10,
      display: 'none',
    })
    expect(toLayoutTree(t)).toMatchObject({ text: 'hi', display: 'none' })

    const img = image({ src: 'x.png', alt: '', width: 4, height: 4, display: 'none' })
    expect(toLayoutTree(img)).toMatchObject({ display: 'none' })

    const s3 = scene3d({ objects: [], width: 8, height: 8, display: 'flex' })
    expect(toLayoutTree(s3)).toMatchObject({ display: 'flex' })
  })

  it('strips src, alt, objectFit from image', () => {
    const el = image({
      src: 'https://example.com/img.png',
      alt: 'An image',
      objectFit: 'cover',
      width: 100,
      height: 100,
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('src')
    expect(layout).not.toHaveProperty('alt')
    expect(layout).not.toHaveProperty('objectFit')
  })

  it('strips paint and hit-target style props from image leaves (same strip list as text)', () => {
    const el = image({
      src: 'https://example.com/x.png',
      alt: 'x',
      width: 40,
      height: 40,
      objectFit: 'contain',
      color: '#333',
      backgroundColor: '#eee',
      borderColor: '#ccc',
      borderRadius: 2,
      borderWidth: 1,
      opacity: 0.9,
      cursor: 'text',
      pointerEvents: 'none',
      zIndex: 3,
      overflow: 'hidden',
      scrollX: 1,
      scrollY: 2,
      boxShadow: { offsetX: 0, offsetY: 1, blur: 2, color: '#000' },
      gradient: { type: 'linear', stops: [{ offset: 0, color: '#fff' }] },
      dir: 'rtl',
    })
    const layout = toLayoutTree(el)
    expect(layout).toMatchObject({ width: 40, height: 40 })
    for (const k of [
      'src',
      'alt',
      'objectFit',
      'color',
      'backgroundColor',
      'borderColor',
      'borderRadius',
      'borderWidth',
      'opacity',
      'cursor',
      'pointerEvents',
      'zIndex',
      'overflow',
      'scrollX',
      'scrollY',
      'boxShadow',
      'gradient',
      'dir',
      'selectable',
    ] as const) {
      expect(layout).not.toHaveProperty(k)
    }
  })

  it('recurses children', () => {
    const el = box({ width: 200, height: 200 }, [
      box({ width: 100, height: 100, backgroundColor: '#f00' }),
      text({ text: 'Hi', font: '14px sans-serif', lineHeight: 18, width: 50, height: 18 }),
    ])
    const layout = toLayoutTree(el) as BoxLayoutNode
    expect(layout.children).toHaveLength(2)
    expect(layout.children[0]).not.toHaveProperty('backgroundColor')
    expect(layout.children[0]).toHaveProperty('width', 100)
  })

  it('strips selectable from nested text (not only the layout root)', () => {
    const el = box({ width: 200, height: 200 }, [
      text({
        text: 'Hi',
        font: '14px sans-serif',
        lineHeight: 18,
        width: 50,
        height: 18,
        selectable: false,
      }),
    ])
    const layout = toLayoutTree(el) as BoxLayoutNode
    expect(layout.children[0]).toMatchObject({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 50,
      height: 18,
    })
    expect(layout.children[0]).not.toHaveProperty('selectable')
  })

  it('strips cursor, pointerEvents, zIndex, overflow, scrollX, scrollY, boxShadow, gradient', () => {
    const el = box({
      width: 100,
      height: 100,
      cursor: 'pointer',
      pointerEvents: 'none',
      zIndex: 5,
      overflow: 'hidden',
      scrollX: 10,
      scrollY: 20,
      boxShadow: { offsetX: 0, offsetY: 2, blur: 4, color: 'rgba(0,0,0,0.2)' },
      gradient: { type: 'linear', stops: [{ offset: 0, color: 'red' }, { offset: 1, color: 'blue' }] },
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('cursor')
    expect(layout).not.toHaveProperty('pointerEvents')
    expect(layout).not.toHaveProperty('zIndex')
    expect(layout).not.toHaveProperty('overflow')
    expect(layout).not.toHaveProperty('scrollX')
    expect(layout).not.toHaveProperty('scrollY')
    expect(layout).not.toHaveProperty('boxShadow')
    expect(layout).not.toHaveProperty('gradient')
  })

  it('strips dir from layout props', () => {
    const el = box({
      width: 100,
      height: 100,
      dir: 'rtl',
    })
    const layout = toLayoutTree(el)
    expect(layout).toHaveProperty('width', 100)
    expect(layout).not.toHaveProperty('dir')
  })

  it('defaults isLayoutRoot to true when omitted (parity with explicit true for createApp layout roots)', () => {
    const row = box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' })
    expect(toLayoutTree(row)).toEqual(toLayoutTree(row, true))

    const inner = box({ width: 50, height: 50, dir: 'rtl' })
    const root = box({ width: 100, height: 100, dir: 'ltr' }, [inner])
    expect(toLayoutTree(root)).toEqual(toLayoutTree(root, true))
  })

  it('isLayoutRoot false preserves dir on subtree heads (advanced embedding; default true strips like app root)', () => {
    const row = box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' })
    expect(toLayoutTree(row, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(row, false)).toHaveProperty('dir', 'rtl')

    const autoRow = box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' })
    expect(toLayoutTree(autoRow, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(autoRow, false)).toHaveProperty('dir', 'auto')

    const t = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'rtl',
    })
    expect(toLayoutTree(t, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(t, false)).toHaveProperty('dir', 'rtl')

    const tAuto = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'auto',
    })
    expect(toLayoutTree(tAuto, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(tAuto, false)).toHaveProperty('dir', 'auto')

    const img = image({ src: '/a.png', width: 8, height: 8, dir: 'ltr' })
    expect(toLayoutTree(img, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(img, false)).toHaveProperty('dir', 'ltr')

    const imgAuto = image({ src: '/a.png', width: 8, height: 8, dir: 'auto' })
    expect(toLayoutTree(imgAuto, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(imgAuto, false)).toHaveProperty('dir', 'auto')

    const s3 = scene3d({
      width: 80,
      height: 80,
      dir: 'rtl',
      objects: [sphere({ radius: 1 })],
    })
    expect(toLayoutTree(s3, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(s3, false)).toHaveProperty('dir', 'rtl')

    const s3Auto = scene3d({
      width: 80,
      height: 80,
      dir: 'auto',
      objects: [sphere({ radius: 1 })],
    })
    expect(toLayoutTree(s3Auto, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(s3Auto, false)).toHaveProperty('dir', 'auto')
  })

  it('isLayoutRoot false forwards JSON null and unknown dir strings for Textura inherit (root still omits dir)', () => {
    const nullDir = box({ width: 10, height: 10, dir: null as never })
    expect(toLayoutTree(nullDir, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(nullDir, false)).toHaveProperty('dir', null)

    const bogus = box({ width: 10, height: 10, dir: 'sideways-lr' as never })
    expect(toLayoutTree(bogus, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(bogus, false)).toHaveProperty('dir', 'sideways-lr')

    const nullText = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: null as never,
    })
    expect(toLayoutTree(nullText, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(nullText, false)).toHaveProperty('dir', null)

    const imgBogus = image({ src: '/a.png', width: 8, height: 8, dir: 'sideways-lr' as never })
    expect(toLayoutTree(imgBogus, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(imgBogus, false)).toHaveProperty('dir', 'sideways-lr')

    const s3Null = scene3d({
      width: 80,
      height: 80,
      dir: null as never,
      objects: [sphere({ radius: 1 })],
    })
    expect(toLayoutTree(s3Null, true)).not.toHaveProperty('dir')
    expect(toLayoutTree(s3Null, false)).toHaveProperty('dir', null)
  })

  it('omits dir on root text, image, and scene3d layout snapshots', () => {
    const t = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'rtl',
    })
    expect(toLayoutTree(t)).not.toHaveProperty('dir')

    const img = image({ src: '/a.png', width: 8, height: 8, dir: 'ltr' })
    expect(toLayoutTree(img)).not.toHaveProperty('dir')

    const s3 = scene3d({
      width: 80,
      height: 80,
      dir: 'rtl',
      objects: [sphere({ radius: 1 })],
    })
    expect(toLayoutTree(s3)).not.toHaveProperty('dir')
  })

  it('forwards dir on nested text, image, and scene3d for Textura', () => {
    const t = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'rtl',
    })
    const img = image({ src: '/a.png', width: 8, height: 8, dir: 'ltr' })
    const s3 = scene3d({
      width: 80,
      height: 80,
      dir: 'rtl',
      objects: [sphere({ radius: 1 })],
    })
    const root = box({ width: 200, height: 200 }, [t, img, s3])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout).not.toHaveProperty('dir')
    expect(layout.children[0]).toHaveProperty('dir', 'rtl')
    expect(layout.children[1]).toHaveProperty('dir', 'ltr')
    expect(layout.children[2]).toHaveProperty('dir', 'rtl')
  })

  it('forwards dir on nested box children for Textura (only the layout root omits dir)', () => {
    const inner = box({ width: 50, height: 50, dir: 'rtl' })
    const root = box({ width: 100, height: 100, dir: 'ltr' }, [inner])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout).not.toHaveProperty('dir')
    const childLayout = layout.children[0] as Record<string, unknown>
    expect(childLayout).toMatchObject({ width: 50, height: 50, dir: 'rtl' })
  })

  it('forwards unknown dir strings on nested boxes verbatim (Textura treats non-ltr/rtl as Inherit)', () => {
    const inner = box({ width: 50, height: 50, dir: 'sideways-lr' as never })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout.children[0]).toMatchObject({ width: 50, height: 50, dir: 'sideways-lr' })
  })

  it('forwards JSON null dir on nested boxes for Textura (malformed deserialization; core resolves like auto)', () => {
    const inner = box({ width: 50, height: 50, dir: null as never })
    const root = box({ width: 100, height: 100 }, [inner])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout).not.toHaveProperty('dir')
    expect(layout.children[0]).toMatchObject({ width: 50, height: 50, dir: null })
  })

  it('omits root dir:auto and forwards dir:auto on descendants for Yoga inherit semantics', () => {
    const inner = box({ width: 50, height: 50, dir: 'auto' })
    const root = box({ width: 100, height: 100, dir: 'auto' }, [inner])
    const layout = toLayoutTree(root) as BoxLayoutNode
    expect(layout).not.toHaveProperty('dir')
    expect(layout.children[0]).toMatchObject({ width: 50, height: 50, dir: 'auto' })

    const t = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 10,
      height: 18,
      dir: 'auto',
    })
    const wrapped = box({ width: 200, height: 200 }, [t])
    const wrapLayout = toLayoutTree(wrapped) as BoxLayoutNode
    expect(wrapLayout).not.toHaveProperty('dir')
    expect(wrapLayout.children[0]).toHaveProperty('dir', 'auto')
  })

  it('does not mutate live element.props when building the layout snapshot', () => {
    const root = box(
      {
        width: 200,
        height: 200,
        backgroundColor: '#111',
        dir: 'rtl',
      },
      [
        text({
          text: 'Hi',
          font: '14px sans-serif',
          lineHeight: 18,
          width: 20,
          height: 18,
          color: '#eee',
          dir: 'ltr',
        }),
      ],
    )
    const rootPropsBefore = { ...root.props }
    const childPropsBefore = { ...(root.children[0]!.props as Record<string, unknown>) }

    toLayoutTree(root)

    expect(root.props).toEqual(rootPropsBefore)
    expect(root.children[0]!.props as Record<string, unknown>).toEqual(childPropsBefore)
    expect(root.props).toHaveProperty('backgroundColor', '#111')
    expect(root.props).toHaveProperty('dir', 'rtl')
    expect(root.children[0]!.props).toMatchObject({ color: '#eee', dir: 'ltr' })
  })

  it('omits runtime box metadata (handlers, key, semantic) from the layout snapshot', () => {
    const child = text({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 20,
      height: 18,
      key: 'leaf',
      semantic: { role: 'button' },
    })
    const el = box(
      {
        width: 100,
        height: 50,
        onClick: () => {},
        key: 'root',
        semantic: { role: 'main' },
      },
      [child],
    )
    expect(el.handlers).toBeDefined()

    const layout = toLayoutTree(el) as BoxLayoutNode
    expect(layout).not.toHaveProperty('handlers')
    expect(layout).not.toHaveProperty('key')
    expect(layout).not.toHaveProperty('semantic')
    const textLayout = layout.children[0] as Record<string, unknown>
    expect(textLayout).toMatchObject({
      text: 'Hi',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 20,
      height: 18,
    })
    expect(textLayout).not.toHaveProperty('key')
    expect(textLayout).not.toHaveProperty('semantic')
  })

  it('strips key and semantic from props on manual / corrupt elements (metadata must not reach Textura)', () => {
    const badBox = {
      kind: 'box' as const,
      props: {
        width: 10,
        height: 10,
        key: 'on-props',
        semantic: { role: 'navigation' as const },
      },
      children: [] as UIElement[],
    } as unknown as UIElement
    const boxLayout = toLayoutTree(badBox) as BoxLayoutNode
    expect(boxLayout).toMatchObject({ width: 10, height: 10, children: [] })
    expect(boxLayout).not.toHaveProperty('key')
    expect(boxLayout).not.toHaveProperty('semantic')

    const badText = {
      kind: 'text' as const,
      props: {
        text: 'x',
        font: '14px sans-serif',
        lineHeight: 18,
        width: 8,
        height: 18,
        key: 't',
        semantic: { role: 'link' as const },
      },
    } as unknown as UIElement
    const textLayout = toLayoutTree(badText) as Record<string, unknown>
    expect(textLayout).toMatchObject({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 8,
      height: 18,
    })
    expect(textLayout).not.toHaveProperty('key')
    expect(textLayout).not.toHaveProperty('semantic')
  })

  it('strips event handler props and mistaken handlers bag from props (must not reach Textura/Yoga)', () => {
    const noop = () => {}
    const badBox = {
      kind: 'box' as const,
      props: {
        width: 10,
        height: 10,
        onClick: noop,
        onPointerDown: noop,
        onPointerUp: noop,
        onPointerMove: noop,
        onWheel: noop,
        onKeyDown: noop,
        onKeyUp: noop,
        onCompositionStart: noop,
        onCompositionUpdate: noop,
        onCompositionEnd: noop,
        handlers: { onClick: noop },
      },
      children: [] as UIElement[],
    } as unknown as UIElement
    const boxLayout = toLayoutTree(badBox) as BoxLayoutNode
    expect(boxLayout).toMatchObject({ width: 10, height: 10, children: [] })
    for (const k of [
      'onClick',
      'onPointerDown',
      'onPointerUp',
      'onPointerMove',
      'onWheel',
      'onKeyDown',
      'onKeyUp',
      'onCompositionStart',
      'onCompositionUpdate',
      'onCompositionEnd',
      'handlers',
    ] as const) {
      expect(boxLayout).not.toHaveProperty(k)
    }

    const badText = {
      kind: 'text' as const,
      props: {
        text: 'x',
        font: '14px sans-serif',
        lineHeight: 18,
        width: 8,
        height: 18,
        onClick: noop,
      },
    } as unknown as UIElement
    const textLayout = toLayoutTree(badText) as Record<string, unknown>
    expect(textLayout).toMatchObject({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 8,
      height: 18,
    })
    expect(textLayout).not.toHaveProperty('onClick')
  })

  it('forwards props not in the strip list to the layout snapshot (strip-list, not a whitelist)', () => {
    const hinted = box({
      width: 10,
      height: 10,
      _experimentalLayoutHint: 42,
    } as unknown as Parameters<typeof box>[0])
    const layout = toLayoutTree(hinted) as Record<string, unknown>
    expect(layout).toMatchObject({ width: 10, height: 10, _experimentalLayoutHint: 42 })

    const textHinted = text({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 8,
      height: 18,
      _customMetricKey: 'ok',
    } as unknown as Parameters<typeof text>[0])
    const tLayout = toLayoutTree(textHinted) as Record<string, unknown>
    expect(tLayout).toMatchObject({
      text: 'x',
      font: '14px sans-serif',
      lineHeight: 18,
      width: 8,
      height: 18,
      _customMetricKey: 'ok',
    })
  })

  it('strips scene3d scene/camera props and paint metadata from scene3d leaves', () => {
    const el = scene3d({
      width: 320,
      height: 200,
      padding: 4,
      background: 0x222222,
      objects: [sphere({ radius: 1 }), ambientLight()],
      fov: 40,
      near: 0.1,
      far: 1000,
      cameraPosition: [0, 1, 4],
      cameraTarget: [0, 0, 0],
      orbitControls: { minDistance: 1 },
      maxPixelRatio: 1.5,
      backgroundColor: '#000',
      cursor: 'grab',
      dir: 'ltr',
    })
    const layout = toLayoutTree(el) as Record<string, unknown>
    expect(layout).toMatchObject({ width: 320, height: 200, padding: 4 })
    expect(layout).not.toHaveProperty('background')
    expect(layout).not.toHaveProperty('objects')
    expect(layout).not.toHaveProperty('fov')
    expect(layout).not.toHaveProperty('near')
    expect(layout).not.toHaveProperty('far')
    expect(layout).not.toHaveProperty('cameraPosition')
    expect(layout).not.toHaveProperty('cameraTarget')
    expect(layout).not.toHaveProperty('orbitControls')
    expect(layout).not.toHaveProperty('maxPixelRatio')
    expect(layout).not.toHaveProperty('backgroundColor')
    expect(layout).not.toHaveProperty('cursor')
    expect(layout).not.toHaveProperty('dir')
  })
})
