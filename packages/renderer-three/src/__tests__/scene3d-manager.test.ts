import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { group, scene3d, sphere } from '@geometra/core'
import { Scene3dManager } from '../scene3d-manager.js'

function sceneContentRoot(scene: THREE.Scene): THREE.Group {
  const g = scene.children[0]
  if (!g || !(g instanceof THREE.Group)) {
    throw new Error('expected Scene3dManager scene group as first scene child')
  }
  return g
}

describe('Scene3dManager', () => {
  it('clears scene content when objects becomes empty', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const mgr = new Scene3dManager(scene, camera)

    mgr.sync(
      scene3d({
        width: 100,
        height: 80,
        objects: [sphere({ color: 0xff0000 })],
      }),
    )
    expect(sceneContentRoot(scene).children.length).toBe(1)

    mgr.sync(
      scene3d({
        width: 100,
        height: 80,
        objects: [],
      }),
    )
    expect(sceneContentRoot(scene).children.length).toBe(0)
  })

  it('updates nested sphere props when wrapped in a group (in-place)', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const mgr = new Scene3dManager(scene, camera)

    mgr.sync(
      scene3d({
        width: 100,
        height: 80,
        objects: [group({ objects: [sphere({ color: 0xff0000 })] })],
      }),
    )

    const top = sceneContentRoot(scene).children[0] as THREE.Group
    const mesh = top.children[0] as THREE.Mesh
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xff0000)

    mgr.sync(
      scene3d({
        width: 100,
        height: 80,
        objects: [group({ objects: [sphere({ color: 0x00ff00 })] })],
      }),
    )

    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x00ff00)
    expect(top.children[0]).toBe(mesh)
  })

  it('rebuilds group children when nested arity changes', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const mgr = new Scene3dManager(scene, camera)

    mgr.sync(
      scene3d({
        width: 100,
        height: 80,
        objects: [group({ objects: [sphere({ color: 0xff0000 })] })],
      }),
    )

    const top = sceneContentRoot(scene).children[0] as THREE.Group
    expect(top.children.length).toBe(1)

    mgr.sync(
      scene3d({
        width: 100,
        height: 80,
        objects: [group({ objects: [sphere({ color: 0xff0000 }), sphere({ color: 0x0000ff })] })],
      }),
    )

    expect(top.children.length).toBe(2)
  })

  it('updates a sphere inside nested groups', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const mgr = new Scene3dManager(scene, camera)

    mgr.sync(
      scene3d({
        width: 100,
        height: 80,
        objects: [
          group({
            objects: [group({ objects: [sphere({ color: 0xff0000 })] })],
          }),
        ],
      }),
    )

    const outer = sceneContentRoot(scene).children[0] as THREE.Group
    const inner = outer.children[0] as THREE.Group
    const mesh = inner.children[0] as THREE.Mesh

    mgr.sync(
      scene3d({
        width: 100,
        height: 80,
        objects: [
          group({
            objects: [group({ objects: [sphere({ color: 0x0000ff })] })],
          }),
        ],
      }),
    )

    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x0000ff)
    expect(inner.children[0]).toBe(mesh)
  })
})
