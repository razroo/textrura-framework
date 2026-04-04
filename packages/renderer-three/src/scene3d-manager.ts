import * as THREE from 'three'
import type {
  Scene3dObject,
  Scene3dSphere,
  Scene3dPoints,
  Scene3dLine,
  Scene3dRing,
  Scene3dAmbientLight,
  Scene3dDirectionalLight,
  Scene3dGroup,
  Scene3dElement,
  OrbitControlsConfig,
} from '@geometra/core'

/** True when `a` and `b` have the same discriminated `type` and matching nested `group` arity/shape. */
function sameObjectStructure(a: Scene3dObject, b: Scene3dObject): boolean {
  if (a.type !== b.type) return false
  if (a.type !== 'group') return true
  const ga = a
  const gb = b as Scene3dGroup
  if (ga.objects.length !== gb.objects.length) return false
  for (let i = 0; i < ga.objects.length; i++) {
    if (!sameObjectStructure(ga.objects[i]!, gb.objects[i]!)) return false
  }
  return true
}

/**
 * Managed Three.js object: the live `Object3D` plus the descriptor it was built from.
 * When the descriptor changes, the object is disposed and rebuilt.
 */
interface ManagedObject {
  descriptor: Scene3dObject
  object: THREE.Object3D
}

/**
 * Manages a Three.js scene graph from declarative {@link Scene3dObject} descriptors streamed
 * from a Geometra server. Call {@link Scene3dManager.sync} each frame (or when the tree updates)
 * to reconcile the live scene with the latest descriptor array.
 */
export class Scene3dManager {
  private managed: ManagedObject[] = []
  private sceneGroup = new THREE.Group()
  private orbitControls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null = null
  private orbitControlsModule: typeof import('three/examples/jsm/controls/OrbitControls.js') | null = null
  private cameraInitialized = false
  private lastCameraTarget: [number, number, number] | undefined

  constructor(
    readonly scene: THREE.Scene,
    readonly camera: THREE.PerspectiveCamera,
  ) {
    scene.add(this.sceneGroup)
  }

  /**
   * Reconcile the live Three.js scene with the given element's props.
   * Creates, updates, or removes objects as needed.
   * Camera position/target are applied on the first call; subsequent calls update
   * orbit controls target but leave camera position to user interaction.
   */
  sync(element: Scene3dElement, canvas?: HTMLCanvasElement): void {
    const { objects, background, fov, near, far, cameraPosition, cameraTarget, orbitControls } =
      element.props

    // Update scene background
    if (background !== undefined) {
      this.scene.background = new THREE.Color(background)
    }

    // Update camera projection (always safe to update)
    if (fov !== undefined && fov > 0 && fov < 180) {
      this.camera.fov = fov
    }
    if (near !== undefined && near > 0) {
      this.camera.near = near
    }
    if (far !== undefined && far > this.camera.near) {
      this.camera.far = far
    }
    this.camera.updateProjectionMatrix()

    // Set camera position only on first sync (subsequent frames: orbit controls owns it)
    if (!this.cameraInitialized) {
      if (cameraPosition) {
        this.camera.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2])
      }
      if (cameraTarget) {
        this.camera.lookAt(cameraTarget[0], cameraTarget[1], cameraTarget[2])
      }
      this.cameraInitialized = true
    }

    // Track the latest target for orbit controls
    if (cameraTarget) {
      this.lastCameraTarget = cameraTarget
    }

    // Orbit controls
    this.syncOrbitControls(orbitControls, canvas)

    // Update orbit controls target to track the scene center
    if (this.orbitControls && this.lastCameraTarget) {
      this.orbitControls.target.set(
        this.lastCameraTarget[0],
        this.lastCameraTarget[1],
        this.lastCameraTarget[2],
      )
    }

    // Reconcile objects
    this.reconcileObjects(objects)
  }

  /** Update orbit controls damping each frame. */
  tick(): void {
    this.orbitControls?.update()
  }

  private syncOrbitControls(
    config: boolean | OrbitControlsConfig | undefined,
    canvas?: HTMLCanvasElement,
  ): void {
    if (!config) {
      if (this.orbitControls) {
        this.orbitControls.dispose()
        this.orbitControls = null
      }
      return
    }
    if (!canvas) return

    if (!this.orbitControls && this.orbitControlsModule) {
      this.orbitControls = new this.orbitControlsModule.OrbitControls(this.camera, canvas)
      this.orbitControls.enableDamping = true
      this.orbitControls.enableZoom = false
    }

    if (!this.orbitControls && !this.orbitControlsModule) {
      // Lazy-load OrbitControls
      void import('three/examples/jsm/controls/OrbitControls.js').then((mod) => {
        this.orbitControlsModule = mod
        if (!this.orbitControls) {
          this.orbitControls = new mod.OrbitControls(this.camera, canvas)
          this.orbitControls.enableDamping = true
          this.orbitControls.enableZoom = false
          this.applyOrbitConfig(config)
        }
      })
      return
    }

    this.applyOrbitConfig(config)
  }

  private applyOrbitConfig(config: boolean | OrbitControlsConfig): void {
    if (!this.orbitControls || typeof config === 'boolean') return
    if (config.damping !== undefined) this.orbitControls.dampingFactor = config.damping
    if (config.minDistance !== undefined) this.orbitControls.minDistance = config.minDistance
    if (config.maxDistance !== undefined) this.orbitControls.maxDistance = config.maxDistance
    if (config.maxPolarAngle !== undefined) this.orbitControls.maxPolarAngle = config.maxPolarAngle
  }

  private reconcileObjects(objects: Scene3dObject[]): void {
    // Simple reconciliation: rebuild if count or types changed, update positions otherwise
    const needsRebuild =
      objects.length !== this.managed.length ||
      objects.some((obj, i) => obj.type !== this.managed[i]?.descriptor.type)

    if (needsRebuild) {
      this.clearManaged()
      for (const desc of objects) {
        const object = createThreeObject(desc)
        this.managed.push({ descriptor: desc, object })
        this.sceneGroup.add(object)
      }
    } else {
      // Update existing objects in place
      for (let i = 0; i < objects.length; i++) {
        const desc = objects[i]!
        const entry = this.managed[i]!
        updateThreeObject(entry.object, entry.descriptor, desc)
        entry.descriptor = desc
      }
    }
  }

  private clearManaged(): void {
    for (const entry of this.managed) {
      this.sceneGroup.remove(entry.object)
      disposeObject(entry.object)
    }
    this.managed = []
  }

  dispose(): void {
    this.clearManaged()
    this.scene.remove(this.sceneGroup)
    if (this.orbitControls) {
      this.orbitControls.dispose()
      this.orbitControls = null
    }
  }
}

// ---------------------------------------------------------------------------
// Object creation from descriptors
// ---------------------------------------------------------------------------

function createThreeObject(desc: Scene3dObject): THREE.Object3D {
  switch (desc.type) {
    case 'sphere':
      return createSphere(desc)
    case 'points':
      return createPoints(desc)
    case 'line':
      return createLine(desc)
    case 'ring':
      return createRing(desc)
    case 'ambientLight':
      return createAmbientLight(desc)
    case 'directionalLight':
      return createDirectionalLight(desc)
    case 'group':
      return createGroup(desc)
  }
}

function createSphere(desc: Scene3dSphere): THREE.Mesh {
  const geom = new THREE.SphereGeometry(
    desc.radius ?? 1,
    desc.widthSegments ?? 32,
    desc.heightSegments ?? 32,
  )
  const mat = new THREE.MeshStandardMaterial({
    color: desc.color ?? 0xffffff,
    emissive: desc.emissive ?? 0x000000,
    metalness: desc.metalness ?? 0,
    roughness: desc.roughness ?? 1,
  })
  const mesh = new THREE.Mesh(geom, mat)
  if (desc.position) mesh.position.set(desc.position[0], desc.position[1], desc.position[2])
  return mesh
}

function createPoints(desc: Scene3dPoints): THREE.Points {
  const geom = new THREE.BufferGeometry()
  const positions = new Float32Array(desc.positions)
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: desc.color ?? 0xffffff,
    size: desc.size ?? 1,
    depthWrite: false,
    opacity: desc.opacity ?? 1,
    transparent: (desc.opacity ?? 1) < 1,
  })
  return new THREE.Points(geom, mat)
}

function createLine(desc: Scene3dLine): THREE.Line {
  const pts = desc.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  const geom = new THREE.BufferGeometry().setFromPoints(pts)

  let mat: THREE.Material
  if (desc.dashed) {
    mat = new THREE.LineDashedMaterial({
      color: desc.color ?? 0xffffff,
      transparent: (desc.opacity ?? 1) < 1,
      opacity: desc.opacity ?? 1,
      dashSize: desc.dashSize ?? 0.14,
      gapSize: desc.gapSize ?? 0.1,
    })
  } else {
    mat = new THREE.LineBasicMaterial({
      color: desc.color ?? 0xffffff,
      transparent: (desc.opacity ?? 1) < 1,
      opacity: desc.opacity ?? 1,
    })
  }

  const line = new THREE.Line(geom, mat)
  if (desc.dashed) line.computeLineDistances()
  return line
}

function createRing(desc: Scene3dRing): THREE.Mesh {
  const geom = new THREE.RingGeometry(
    desc.innerRadius,
    desc.outerRadius,
    desc.segments ?? 128,
  )
  const mat = new THREE.MeshBasicMaterial({
    color: desc.color ?? 0xffffff,
    side: THREE.DoubleSide,
    transparent: (desc.opacity ?? 1) < 1,
    opacity: desc.opacity ?? 1,
  })
  const mesh = new THREE.Mesh(geom, mat)
  if (desc.position) mesh.position.set(desc.position[0], desc.position[1], desc.position[2])
  if (desc.rotation) mesh.rotation.set(desc.rotation[0], desc.rotation[1], desc.rotation[2])
  return mesh
}

function createAmbientLight(desc: Scene3dAmbientLight): THREE.AmbientLight {
  return new THREE.AmbientLight(desc.color ?? 0xffffff, desc.intensity ?? 1)
}

function createDirectionalLight(desc: Scene3dDirectionalLight): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(desc.color ?? 0xffffff, desc.intensity ?? 1)
  if (desc.position) light.position.set(desc.position[0], desc.position[1], desc.position[2])
  return light
}

function createGroup(desc: Scene3dGroup): THREE.Group {
  const group = new THREE.Group()
  if (desc.position) group.position.set(desc.position[0], desc.position[1], desc.position[2])
  for (const child of desc.objects) {
    group.add(createThreeObject(child))
  }
  return group
}

// ---------------------------------------------------------------------------
// In-place updates (position, color, etc.) without full rebuild
// ---------------------------------------------------------------------------

function updateThreeObject(
  object: THREE.Object3D,
  _oldDesc: Scene3dObject,
  newDesc: Scene3dObject,
): void {
  switch (newDesc.type) {
    case 'sphere':
      updateSphere(object as THREE.Mesh, newDesc)
      break
    case 'points':
      updatePoints(object as THREE.Points, newDesc)
      break
    case 'line':
      updateLine(object as THREE.Line, newDesc)
      break
    case 'ring':
      updateRing(object as THREE.Mesh, newDesc)
      break
    case 'ambientLight':
      updateAmbientLight(object as THREE.AmbientLight, newDesc)
      break
    case 'directionalLight':
      updateDirectionalLight(object as THREE.DirectionalLight, newDesc)
      break
    case 'group':
      updateGroup(object as THREE.Group, _oldDesc as Scene3dGroup, newDesc as Scene3dGroup)
      break
  }
}

function updateGroup(group: THREE.Group, oldDesc: Scene3dGroup, newDesc: Scene3dGroup): void {
  if (newDesc.position) {
    group.position.set(newDesc.position[0], newDesc.position[1], newDesc.position[2])
  }
  if (!sameObjectStructure(oldDesc, newDesc) || group.children.length !== newDesc.objects.length) {
    for (const child of [...group.children]) {
      group.remove(child)
      disposeObject(child)
    }
    for (const childDesc of newDesc.objects) {
      group.add(createThreeObject(childDesc))
    }
    return
  }
  for (let i = 0; i < newDesc.objects.length; i++) {
    const ch = group.children[i]
    if (ch) {
      updateThreeObject(ch, oldDesc.objects[i]!, newDesc.objects[i]!)
    }
  }
}

function updateSphere(mesh: THREE.Mesh, desc: Scene3dSphere): void {
  if (desc.position) mesh.position.set(desc.position[0], desc.position[1], desc.position[2])
  const mat = mesh.material as THREE.MeshStandardMaterial
  if (desc.color !== undefined) mat.color.setHex(desc.color)
  if (desc.emissive !== undefined) mat.emissive.setHex(desc.emissive)
}

function updatePoints(points: THREE.Points, desc: Scene3dPoints): void {
  const geom = points.geometry
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute
  const newPositions = new Float32Array(desc.positions)
  if (posAttr.count * 3 === newPositions.length) {
    posAttr.set(newPositions)
    posAttr.needsUpdate = true
  }
}

function updateLine(line: THREE.Line, desc: Scene3dLine): void {
  const pts = desc.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  line.geometry.dispose()
  line.geometry = new THREE.BufferGeometry().setFromPoints(pts)
  if (desc.dashed) line.computeLineDistances()
}

function updateRing(mesh: THREE.Mesh, desc: Scene3dRing): void {
  if (desc.position) mesh.position.set(desc.position[0], desc.position[1], desc.position[2])
  if (desc.rotation) mesh.rotation.set(desc.rotation[0], desc.rotation[1], desc.rotation[2])
}

function updateAmbientLight(light: THREE.AmbientLight, desc: Scene3dAmbientLight): void {
  if (desc.color !== undefined) light.color.setHex(desc.color)
  if (desc.intensity !== undefined) light.intensity = desc.intensity
}

function updateDirectionalLight(light: THREE.DirectionalLight, desc: Scene3dDirectionalLight): void {
  if (desc.color !== undefined) light.color.setHex(desc.color)
  if (desc.intensity !== undefined) light.intensity = desc.intensity
  if (desc.position) light.position.set(desc.position[0], desc.position[1], desc.position[2])
}

// ---------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------

function disposeObject(object: THREE.Object3D): void {
  if (object instanceof THREE.Mesh) {
    object.geometry.dispose()
    if (Array.isArray(object.material)) {
      for (const mat of object.material) mat.dispose()
    } else {
      object.material.dispose()
    }
  } else if (object instanceof THREE.Points) {
    object.geometry.dispose()
    ;(object.material as THREE.Material).dispose()
  } else if (object instanceof THREE.Line) {
    object.geometry.dispose()
    ;(object.material as THREE.Material).dispose()
  } else if (object instanceof THREE.Group) {
    for (const child of [...object.children]) {
      disposeObject(child)
    }
  }
}
