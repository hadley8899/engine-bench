import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Telemetry } from '../sim/core'
import { pistonTravel, phaseName, wrap } from '../sim/physics'
import type { EngineDefinition, Metres } from '../sim/schema'

const phaseColours = [0xff7a12, 0xff3b6b, 0x1fc8ff, 0x9d6bff]

function layoutName(layout: EngineDefinition['layout']) {
  return ({
    'inline-6': 'INLINE SIX',
    'v-6': 'V6',
    'v-8': 'CROSS-PLANE V8',
    'boxer-4': 'BOXER FOUR',
  } as Partial<Record<EngineDefinition['layout'], string>>)[layout] ?? layout.toUpperCase()
}

/** Cylinder's position along the crank and bank angle about the crank axis. */
function placement(e: EngineDefinition, cylinder: number) {
  if (e.layout === 'inline-6') return { station: cylinder, bank: 0 }
  if (e.layout === 'boxer-4') {
    const left = cylinder === 0 || cylinder === 2
    return { station: cylinder < 2 ? 0 : 1, bank: left ? Math.PI / 2 : -Math.PI / 2 }
  }
  const bank = cylinder % 2 === 0 ? 1 : -1
  const angle = e.layout === 'v-8' ? Math.PI / 4 : Math.PI / 6
  return { station: Math.floor(cylinder / 2), bank: bank * angle }
}

/** A bounded, definition-driven cutaway for Stage 11's multi-bank layouts. */
export function MultiBankView({
  engine,
  telemetry,
  slow,
  overlays,
  selected,
  onSelect,
}: {
  engine: EngineDefinition
  telemetry: React.RefObject<Telemetry | null>
  slow: boolean
  overlays: boolean
  selected: number
  onSelect: (cylinder: number) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const options = useRef({ slow, overlays, selected, onSelect })
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    options.current = { slow, overlays, selected, onSelect }
  }, [slow, overlays, selected, onSelect])

  useEffect(() => {
    const host = container.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      const timer = window.setTimeout(() => setFailed(true), 0)
      return () => window.clearTimeout(timer)
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setClearColor(0x101a20, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    host.appendChild(renderer.domElement)
    renderer.domElement.setAttribute(
      'aria-label',
      `Interactive ${layoutName(engine.layout).toLowerCase()} cutaway; drag to orbit and scroll to zoom`,
    )

    const scene = new THREE.Scene()
    const spacing = Math.max(0.075, engine.bore * 1.18)
    const stations = engine.layout === 'inline-6' ? 6 : engine.cylinders / 2
    const width = spacing * (stations + 0.8)
    const height = engine.rodLength + engine.stroke * 1.8
    const size = Math.max(width, height * 1.7)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, size * 12)
    camera.position.set(size * 0.58, size * 0.46, size * 0.78)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, height * 0.35, 0)
    controls.enableDamping = true
    controls.minDistance = size * 0.45
    controls.maxDistance = size * 2
    scene.add(new THREE.HemisphereLight(0xc9d7df, 0x10161a, 1.7))
    const key = new THREE.DirectionalLight(0xfff2df, 4)
    key.position.set(size, size * 2, size)
    scene.add(key)

    const cast = new THREE.MeshStandardMaterial({ color: 0x56636a, roughness: 0.72, metalness: 0.55 })
    const steel = new THREE.MeshStandardMaterial({ color: 0x9ca5a8, roughness: 0.3, metalness: 0.9 })
    const aluminium = new THREE.MeshStandardMaterial({ color: 0xaeb8ba, roughness: 0.38, metalness: 0.72 })
    const meshes: THREE.Mesh[] = []
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = scene) => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      meshes.push(mesh)
      return mesh
    }

    const crank = add(new THREE.CylinderGeometry(engine.bore * 0.12, engine.bore * 0.12, width, 20), steel)
    crank.rotation.z = Math.PI / 2
    add(new THREE.BoxGeometry(width, engine.stroke * 0.62, engine.bore * 1.35), cast).position.y = -engine.stroke * 0.22

    const pistons: THREE.Mesh[] = []
    const gases: THREE.Mesh[] = []
    const rods: THREE.Mesh[] = []
    const groups: THREE.Group[] = []
    const up = new THREE.Vector3(0, 1, 0)
    const r = engine.stroke / 2
    for (let i = 0; i < engine.cylinders; i++) {
      const place = placement(engine, i)
      const group = new THREE.Group()
      group.position.x = (place.station - (stations - 1) / 2) * spacing
      group.rotation.x = place.bank
      scene.add(group)
      groups.push(group)
      const sleeve = add(new THREE.CylinderGeometry(engine.bore * 0.53, engine.bore * 0.53, engine.stroke * 1.35, 28, 1, true), cast, group)
      sleeve.position.y = engine.rodLength + engine.stroke * 0.34
      sleeve.userData.cylinder = i
      const pistonMaterial = aluminium.clone()
      pistonMaterial.emissive.setHex(0xff3a10)
      pistonMaterial.emissiveIntensity = 0
      const piston = add(new THREE.CylinderGeometry(engine.bore * 0.47, engine.bore * 0.46, engine.bore * 0.28, 28), pistonMaterial, group)
      piston.userData.cylinder = i
      pistons.push(piston)
      const gas = add(new THREE.CylinderGeometry(engine.bore * 0.45, engine.bore * 0.45, 1, 24), new THREE.MeshStandardMaterial({
        color: phaseColours[0], emissive: phaseColours[0], emissiveIntensity: 0.5,
        transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false,
      }), group)
      gas.userData.cylinder = i
      gases.push(gas)
      const rod = add(new THREE.CylinderGeometry(engine.bore * 0.055, engine.bore * 0.075, engine.rodLength, 12), steel, group)
      rods.push(rod)
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const click = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(meshes).find((h) => typeof h.object.userData.cylinder === 'number')
      if (hit) options.current.onSelect(hit.object.userData.cylinder as number)
    }
    renderer.domElement.addEventListener('pointerup', click)
    const resize = new ResizeObserver(([entry]) => {
      const w = Math.max(1, entry.contentRect.width), h = Math.max(1, entry.contentRect.height)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    resize.observe(host)

    let frame = 0, inspectionAngle = 0, last = performance.now()
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = telemetry.current
      inspectionAngle = wrap(inspectionAngle + dt * Math.PI * 0.5)
      const angle = options.current.slow ? inspectionAngle : (t?.angle ?? 0)
      for (let i = 0; i < engine.cylinders; i++) {
        const offset = engine.firingOrder.indexOf(i + 1) * ((Math.PI * 4) / engine.cylinders)
        const phase = wrap(angle - offset)
        const travel = pistonTravel(phase, engine.stroke as Metres, engine.rodLength as Metres)
        const pistonY = engine.rodLength + r - travel
        pistons[i].position.y = pistonY
        const crankPin = new THREE.Vector3(0, r * Math.cos(phase), r * Math.sin(phase))
        const wrist = new THREE.Vector3(0, pistonY, 0)
        rods[i].position.copy(crankPin).add(wrist).multiplyScalar(0.5)
        rods[i].quaternion.setFromUnitVectors(up, wrist.clone().sub(crankPin).normalize())
        rods[i].scale.y = wrist.distanceTo(crankPin) / engine.rodLength
        const gasHeight = Math.max(engine.bore * 0.04, travel + engine.stroke / (engine.compression - 1))
        gases[i].scale.y = gasHeight
        gases[i].position.y = pistonY + gasHeight / 2
        const degrees = (phase * 180) / Math.PI
        const colour = phaseColours[Math.floor(degrees / 180)]
        const material = gases[i].material as THREE.MeshStandardMaterial
        material.color.setHex(options.current.overlays ? colour : 0xd7a356)
        material.emissive.setHex(colour)
        material.emissiveIntensity = options.current.selected === i ? 1.5 : 0.5
        material.opacity = options.current.overlays ? 0.72 : 0.14
        ;(pistons[i].material as THREE.MeshStandardMaterial).emissiveIntensity = t
          ? Math.min(1.2, Math.max(0, (t.temperatures.crown[i] - 523) / 110)) : 0
        groups[i].scale.setScalar(options.current.selected === i ? 1.035 : 1)
      }
      crank.rotation.x = angle
      controls.update()
      renderer.render(scene, camera)
    }
    animate()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerup', click)
      for (const mesh of meshes) {
        mesh.geometry.dispose()
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) material.dispose()
      }
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [engine, telemetry])

  return (
    <div className="engine-viewport" ref={container} data-testid="engine-view">
      {failed && <p className="viewport-fallback">3D needs WebGL. The engine, sound and dyno remain available.</p>}
      <div className="viewport-caption">
        <span>{slow ? 'INSPECTION · 15 RPM · sound muted' : `LIVE CUTAWAY · ${layoutName(engine.layout)}`}</span>
        <span>Drag to orbit · scroll to zoom · select a piston</span>
      </div>
      <div className="cylinder-selector">
        {Array.from({ length: engine.cylinders }, (_, i) => (
          <button key={i} className={selected === i ? 'selected' : ''} onClick={() => onSelect(i)} aria-label={`Inspect cylinder ${i + 1}`}>
            CYL {i + 1}<small>{phaseName(telemetry.current?.phases[i] ?? 0)}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
