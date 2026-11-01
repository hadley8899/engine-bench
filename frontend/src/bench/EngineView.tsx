import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { EngineDefinition, Metres } from '../sim/schema'
import type { Telemetry } from '../sim/core'
import { pistonTravel, phaseName, wrap } from '../sim/physics'

const phaseColours = [0xf5aa42, 0xe47765, 0x5abfd1, 0x9b98dc]
export function EngineView({
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
    host.appendChild(renderer.domElement)
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive inline-four cutaway; drag to orbit and scroll to zoom',
    )
    const scene = new THREE.Scene()
    // Framing was tuned on an 86 × 86 mm build; scale it with block size so
    // tiny and huge engines both fit the view.
    const size =
      Math.max(
        engine.bore * 1.18 * 4 + 0.03,
        (engine.rodLength + engine.stroke * 1.5) * 1.6,
      ) / 0.436
    const camera = new THREE.PerspectiveCamera(
      37,
      1,
      0.01 * Math.min(size, 1),
      10 * Math.max(size, 1),
    )
    camera.position.set(0.56 * size, 0.48 * size, 0.61 * size)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.09 * size, 0)
    controls.enableDamping = true
    controls.minDistance = 0.35 * size
    controls.maxDistance = 1.6 * size
    scene.add(new THREE.HemisphereLight(0xdcecf6, 0x25323c, 2.4))
    const sun = new THREE.DirectionalLight(0xffffff, 3)
    sun.position.set(1, 2, 1)
    scene.add(sun)
    const rim = new THREE.DirectionalLight(0xfda64e, 2)
    rim.position.set(-1, 0.5, -1)
    scene.add(rim)
    const metal = new THREE.MeshStandardMaterial({
      color: 0xc1cbd2,
      metalness: 0.75,
      roughness: 0.28,
    })
    const dark = new THREE.MeshStandardMaterial({
      color: 0x344754,
      metalness: 0.8,
      roughness: 0.35,
    })
    const amber = new THREE.MeshStandardMaterial({
      color: 0xe8a048,
      metalness: 0.7,
      roughness: 0.3,
    })
    const cylinderMat = new THREE.MeshStandardMaterial({
      color: 0x7697a6,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
      metalness: 0.4,
      roughness: 0.3,
    })
    const meshes: THREE.Mesh[] = []
    const pistons: THREE.Mesh[] = [],
      rods: THREE.Mesh[] = [],
      pins: THREE.Mesh[] = [],
      chambers: THREE.Mesh[] = [],
      valves: THREE.Mesh[][] = []
    function mesh(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) {
      const m = new THREE.Mesh(geometry, material)
      m.position.set(x, y, z)
      scene.add(m)
      meshes.push(m)
      return m
    }
    const spacing = engine.bore * 1.18
    const width = spacing * 4 + 0.03
    const r = engine.stroke / 2
    const head =
      engine.rodLength + r + 0.0135 + engine.stroke / (engine.compression - 1)
    mesh(
      new THREE.BoxGeometry(width, 0.02, engine.bore * 1.6),
      dark,
      0,
      -0.07,
      0,
    )
    const crank = mesh(
      new THREE.CylinderGeometry(0.012, 0.012, width, 24),
      metal,
      0,
      0,
      0,
    )
    crank.rotation.z = Math.PI / 2
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * spacing
      const piston = mesh(
        new THREE.CylinderGeometry(
          engine.bore * 0.475,
          engine.bore * 0.475,
          0.027,
          32,
        ),
        metal,
        x,
        0.16,
        0,
      )
      piston.userData.cylinder = i
      pistons.push(piston)
      const sleeve = mesh(
        new THREE.CylinderGeometry(
          engine.bore * 0.51,
          engine.bore * 0.51,
          engine.stroke + 0.045,
          40,
          1,
          true,
        ),
        cylinderMat,
        x,
        engine.rodLength,
        0,
      )
      sleeve.userData.cylinder = i
      for (const y of [engine.rodLength - r - 0.022, head])
        mesh(
          new THREE.TorusGeometry(engine.bore * 0.52, 0.002, 8, 40),
          dark,
          x,
          y,
          0,
        ).rotation.x = Math.PI / 2
      rods.push(
        mesh(new THREE.CylinderGeometry(0.007, 0.009, 1, 12), dark, x, 0.08, 0),
      )
      pins.push(mesh(new THREE.SphereGeometry(0.012, 16, 12), amber, x, 0, r))
      const gas = mesh(
        new THREE.CylinderGeometry(
          engine.bore * 0.44,
          engine.bore * 0.44,
          0.018,
          24,
        ),
        new THREE.MeshStandardMaterial({
          color: phaseColours[0],
          emissive: phaseColours[0],
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.7,
        }),
        x,
        head - 0.012,
        0,
      )
      gas.userData.cylinder = i
      chambers.push(gas)
      const pair = [-1, 1].map((v) =>
        mesh(
          new THREE.CylinderGeometry(0.013, 0.013, 0.004, 20),
          v < 0 ? metal : amber,
          x,
          head + 0.014,
          v * 0.021,
        ),
      )
      valves.push(pair)
      const bearing = mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.018, 24),
        dark,
        x,
        0,
        0,
      )
      bearing.rotation.z = Math.PI / 2
    }
    for (const x of [-width / 2, width / 2]) {
      mesh(new THREE.BoxGeometry(0.012, 0.1, 0.13), dark, x, -0.02, 0)
      for (const z of [-0.09, 0.09])
        mesh(
          new THREE.CylinderGeometry(0.008, 0.012, 0.07, 12),
          metal,
          x,
          -0.11,
          z,
        )
    }
    const flywheel = mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.014, 48),
      dark,
      width / 2 + 0.025,
      0,
      0,
    )
    flywheel.rotation.z = Math.PI / 2
    const grid = new THREE.GridHelper(1.6, 32, 0x43505a, 0x27343c)
    grid.scale.setScalar(Math.max(size, 1))
    grid.position.y = -0.15 * Math.max(size, 1)
    scene.add(grid)
    const raycaster = new THREE.Raycaster()
    const click = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      )
      const hit = raycaster
        .intersectObjects([...pistons, ...chambers])
        .find((h) => typeof h.object.userData.cylinder === 'number')
      if (hit) options.current.onSelect(hit.object.userData.cylinder)
    }
    renderer.domElement.addEventListener('pointerup', click)
    const resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    resize.observe(host)
    let frame = 0,
      last = performance.now(),
      inspectionAngle = 0,
      lastSample = -1,
      receivedAt = performance.now()
    const up = new THREE.Vector3(0, 1, 0)
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const now = performance.now(),
        dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = telemetry.current
      if (t && t.sample !== lastSample) {
        lastSample = t.sample
        receivedAt = now
      }
      inspectionAngle = wrap(inspectionAngle + dt * Math.PI * 0.5)
      const angle = options.current.slow
        ? inspectionAngle
        : (t?.angle ?? 0) +
          (t
            ? ((t.rpm * Math.PI) / 30) *
              Math.min((now - receivedAt) / 1000, 0.1)
            : 0)
      for (let i = 0; i < 4; i++) {
        const offset =
          engine.firingOrder.indexOf((i + 1) as 1 | 2 | 3 | 4) * Math.PI
        const phase = wrap(angle - offset)
        const travel = pistonTravel(
          phase,
          engine.stroke as Metres,
          engine.rodLength as Metres,
        )
        const y = engine.rodLength + r - travel
        pistons[i].position.y = y
        pins[i].position.set(
          pistons[i].position.x,
          r * Math.cos(phase),
          r * Math.sin(phase),
        )
        const from = pins[i].position,
          to = pistons[i].position
        rods[i].position.copy(from).add(to).multiplyScalar(0.5)
        const direction = to.clone().sub(from)
        rods[i].scale.y = direction.length()
        rods[i].quaternion.setFromUnitVectors(up, direction.normalize())
        const degrees = (phase * 180) / Math.PI,
          colour = phaseColours[Math.floor(degrees / 180)]
        const material = chambers[i].material as THREE.MeshStandardMaterial
        material.color.setHex(options.current.overlays ? colour : 0xd7a356)
        material.emissive.setHex(colour)
        material.opacity = options.current.overlays
          ? degrees < 65
            ? 0.95
            : 0.38
          : 0.12
        material.emissiveIntensity = options.current.selected === i ? 1 : 0.2
        const height = Math.max(0.006, head - y - 0.0135)
        chambers[i].scale.y = height / 0.018
        chambers[i].position.y = y + 0.0135 + height / 2
        valves[i][0].position.y =
          head +
          0.014 -
          (degrees >= 350 && degrees < engine.intakeClose
            ? 0.008 *
              Math.sin((Math.PI * (degrees - 350)) / (engine.intakeClose - 350))
            : 0)
        valves[i][1].position.y =
          head +
          0.014 -
          (degrees >= 145 && degrees < 370
            ? 0.008 * Math.sin((Math.PI * (degrees - 145)) / 225)
            : 0)
      }
      controls.update()
      renderer.render(scene, camera)
    }
    animate()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerup', click)
      for (const m of meshes) {
        m.geometry.dispose()
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        for (const mat of mats) mat.dispose()
      }
      grid.geometry.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [engine, telemetry])
  return (
    <div className="engine-viewport" ref={container} data-testid="engine-view">
      {failed && (
        <p className="viewport-fallback">
          3D needs WebGL. The engine, sound and dyno remain available.
        </p>
      )}
      <div className="viewport-caption">
        <span>
          {slow
            ? 'INSPECTION · 15 RPM · sound muted'
            : 'LIVE CUTAWAY · INLINE FOUR'}
        </span>
        <span>Drag to orbit · scroll to zoom · select a piston</span>
      </div>
      <div className="cylinder-selector">
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            className={selected === i ? 'selected' : ''}
            onClick={() => onSelect(i)}
            aria-label={`Inspect cylinder ${i + 1}`}
          >
            CYL {i + 1}
            <small>{phaseName(telemetry.current?.phases[i] ?? 0)}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
