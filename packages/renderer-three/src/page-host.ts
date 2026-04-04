import {
  createBrowserCanvasClient,
  type BrowserCanvasClientHandle,
  type BrowserCanvasClientOptions,
} from '@geometra/renderer-canvas'
import {
  createThreeGeometraSplitHost,
  type ThreeGeometraSplitHostHandle,
  type ThreeGeometraSplitHostOptions,
} from './split-host.js'

/** A Geometra canvas section rendered as a full-width block in the page flow. */
export interface GeometraPageSection {
  /** Unique id for this section. */
  id: string
  /** WebSocket URL for the Geometra server view. */
  url: string
  /** Fixed height in CSS pixels. The server should compute layout at this height. */
  height: number
  /** Enable binary framing for the WebSocket. */
  binaryFraming?: boolean
  /** Renderer options (background color, etc.). */
  rendererOptions?: Omit<BrowserCanvasClientOptions['rendererOptions'], 'canvas'>
}

export interface ThreeGeometraPageHostOptions extends ThreeGeometraSplitHostOptions {
  /** Optional header section rendered above the split host. */
  headerSection?: GeometraPageSection
  /** Additional Geometra sections rendered below the split host in document flow. */
  belowFoldSections?: GeometraPageSection[]
}

export interface ThreeGeometraPageHostHandle extends ThreeGeometraSplitHostHandle {
  /** Header Geometra client (present when `headerSection` was provided). */
  header?: BrowserCanvasClientHandle
  /** Below-fold Geometra clients keyed by section id. */
  belowFold: Map<string, BrowserCanvasClientHandle>
  /** The outer page container (scrollable). */
  pageRoot: HTMLDivElement
}

function createSectionCanvas(
  doc: Document,
  section: GeometraPageSection,
  win: Window,
): { wrapper: HTMLDivElement; handle: BrowserCanvasClientHandle } {
  const wrapper = doc.createElement('div')
  wrapper.style.width = '100%'
  wrapper.style.height = `${section.height}px`
  wrapper.style.minWidth = '0'
  wrapper.dataset.geometraSection = section.id

  const canvas = doc.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  wrapper.appendChild(canvas)

  const handle = createBrowserCanvasClient({
    url: section.url,
    binaryFraming: section.binaryFraming,
    canvas,
    window: win,
    rendererOptions: {
      background: '#0b0e14',
      ...section.rendererOptions,
    },
  })

  return { wrapper, handle }
}

/**
 * Page-level host that composes multiple Geometra canvas sections into a scrollable page.
 *
 * The top section is a viewport-height split host (Three.js + Geometra console panel).
 * Optional header and below-fold sections are standard Geometra canvas clients rendered
 * at full page width in normal document flow, so the browser handles scrolling.
 *
 * Each section connects to its own WebSocket endpoint. The server exposes multiple
 * `createGeometraServer` instances on different `wsPath` values.
 */
export function createThreeGeometraPageHost(
  options: ThreeGeometraPageHostOptions,
): ThreeGeometraPageHostHandle {
  const {
    container,
    headerSection,
    belowFoldSections = [],
    ...splitOptions
  } = options

  const doc = container.ownerDocument
  const win = (options as { window?: Window }).window ?? doc.defaultView
  if (!win) {
    throw new Error('createThreeGeometraPageHost requires a browser window')
  }

  // Outer page container (normal document flow, scrollable)
  const pageRoot = doc.createElement('div')
  pageRoot.style.width = '100%'
  container.appendChild(pageRoot)

  // Header section (optional)
  let headerHandle: BrowserCanvasClientHandle | undefined
  if (headerSection) {
    const { wrapper, handle } = createSectionCanvas(doc, headerSection, win)
    pageRoot.appendChild(wrapper)
    headerHandle = handle
  }

  // Split host section (viewport height)
  const splitMount = doc.createElement('div')
  splitMount.style.width = '100%'
  splitMount.style.height = 'calc(100vh - ' + (headerSection ? headerSection.height : 0) + 'px)'
  splitMount.style.clipPath = 'inset(0)'
  pageRoot.appendChild(splitMount)

  const splitHost = createThreeGeometraSplitHost({
    ...splitOptions,
    container: splitMount,
  })

  // Below-fold sections
  const belowFoldMap = new Map<string, BrowserCanvasClientHandle>()
  for (const section of belowFoldSections) {
    const { wrapper, handle } = createSectionCanvas(doc, section, win)
    pageRoot.appendChild(wrapper)
    belowFoldMap.set(section.id, handle)
  }

  const originalDestroy = splitHost.destroy
  const destroy = () => {
    headerHandle?.destroy()
    for (const handle of belowFoldMap.values()) {
      handle.destroy()
    }
    belowFoldMap.clear()
    originalDestroy()
    pageRoot.remove()
  }

  return {
    ...splitHost,
    header: headerHandle,
    belowFold: belowFoldMap,
    pageRoot,
    destroy,
  }
}
