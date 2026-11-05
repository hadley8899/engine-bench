import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { pipeSegments } from '../sim/schema'
import type { EngineDefinition, Metres } from '../sim/schema'
import type { Telemetry } from '../sim/core'
import { pistonTravel, TAU } from '../sim/physics'
import { portTiming, WAVE_SNAPSHOTS } from '../sim/twostroke'
import { twoStrokePhase } from './twoStrokeFields'

// Power, blowdown, scavenge, trapping, compression.
const phaseColours = {
  Power: 0xff7a12,
  Blowdown: 0xff3b6b,
  Scavenge: 0x1fc8ff,
  Trapping: 0x56d39b,
  Compression: 0x9d6bff,
}
const wrapRev = (a: number) => ((a % TAU) + TAU) % TAU
/** Suction blue, ambient grey, pressure orange: ±0.8 bar spans the scale. */
function pressureColour(gauge: number, out: THREE.Color) {
  const k = Math.max(-1, Math.min(1, gauge / 80000))
  if (k < 0) out.setRGB(0.42 + 0.58 * k * 0.6, 0.47 + 0.2 * -k, 0.52 + 0.48 * -k)
  else out.setRGB(0.47 + 0.53 * k, 0.47 - 0.05 * k, 0.5 - 0.42 * k)
  return out
}

/**
 * Cutaway of a crankcase-scavenged two-stroke: the liner with its exhaust,
 * transfer and intake ports, the piston that opens them, the crank and
 * crankcase, and the exhaust pipe drawn from the same segments the pipe
 * solver uses, coloured by its simulated pressure.
 */
export function TwoStrokeView({
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
  const cameraPreset = useRef<((name: string) => void) | null>(null)
  const timing = portTiming(engine)
  useEffect(() => {
    options.current = { slow, overlays, selected, onSelect }
  }, [slow, overlays, selected, onSelect])
  useEffect(() => {
    const host = container.current!
    const ts = engine.twoStroke!
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
    renderer.toneMappingExposure = 0.95
    host.appendChild(renderer.domElement)
    renderer.domElement.setAttribute(
      'aria-label',
      `Interactive two-stroke ${engine.cylinders === 1 ? 'single' : 'twin'} cutaway showing the ports and exhaust pipe; drag to orbit and scroll to zoom`,
    )
    const scene = new THREE.Scene()
    const meshes: THREE.Mesh[] = []
    const material = (
      color: number,
      extra: THREE.MeshStandardMaterialParameters = {},
    ) => new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.4, ...extra })
    const steel = material(0xaeb7bd, { metalness: 1, roughness: 0.3 })
    const aluminium = material(0xb8bec0, { metalness: 0.88, roughness: 0.36 })
    const casting = material(0x30373a, { metalness: 0.6, roughness: 0.8 })
    const forged = material(0x697175, { roughness: 0.48 })
    const ceramic = material(0xf4f1ea, { metalness: 0, roughness: 0.3 })
    const liner = new THREE.MeshPhysicalMaterial({
      color: 0x91a5ad,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      metalness: 0.25,
      roughness: 0.2,
    })
    function mesh(
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) {
      const m = new THREE.Mesh(geometry, mat)
      m.position.set(x, y, z)
      parent.add(m)
      meshes.push(m)
      return m
    }
    const u = engine.bore
    const r = engine.stroke / 2
    const radius = u / 2
    const n = engine.cylinders
    const spacing = u * 1.6
    const pistonHeight = 0.85 * u
    // The crown is flush with the deck at top dead centre.
    const deck = engine.rodLength + r + 0.4 * u
    const crankY = 0
    const pinBelowCrown = 0.4 * u
    const skirt = pistonHeight
    const pistons: THREE.Mesh[] = []
    const pins: THREE.Mesh[] = []
    const rods: THREE.Mesh[] = []
    const webs: THREE.Group[] = []
    const chambers: THREE.Mesh[] = []
    const sparks: THREE.MeshStandardMaterial[] = []
    const ports: { mat: THREE.MeshStandardMaterial; top: number; kind: string; cylinder: number }[] = []
    const reeds: THREE.Group[] = []
    const discs: THREE.Group[] = []
    const pipeMeshes: { geometry: THREE.LatheGeometry; cells: number[] }[] = []
    const portWindow = (
      x: number,
      centre: number,
      half: number,
      top: number,
      bottom: number,
      colour: number,
      kind: string,
      cylinder: number,
    ) => {
      const mat = new THREE.MeshStandardMaterial({
        color: colour,
        emissive: colour,
        emissiveIntensity: 0.2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
      const g = new THREE.CylinderGeometry(radius * 1.005, radius * 1.005, top - bottom, 12, 1, true, centre - half, 2 * half)
      mesh(g, mat, x, (top + bottom) / 2, 0)
      ports.push({ mat, top, kind, cylinder })
    }
    const angleOf = (width: number) => Math.asin(Math.min(0.999, width / u))
    const bottomDead = deck - engine.stroke
    const exhaustTop = deck - ts.exhaustPort.height
    const transferTop = deck - ts.transfers.height
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * spacing
      // Liner, barrel casting behind it and the head.
      mesh(new THREE.CylinderGeometry(radius, radius, deck - bottomDead + skirt, 40, 1, true), liner, x, (deck + bottomDead - skirt) / 2, 0)
      const barrel = new THREE.CylinderGeometry(radius * 1.35, radius * 1.35, deck - bottomDead + 0.2 * u, 40, 1, true, Math.PI / 2, Math.PI)
      mesh(barrel, casting, x, (deck + bottomDead) / 2, 0)
      mesh(new RoundedBoxGeometry(u * 1.4, 0.32 * u, u * 1.4, 3, 0.06 * u), aluminium, x, deck + 0.24 * u, 0)
      // Exhaust faces the front; a bridged port is two windows.
      const exHalf = angleOf(ts.exhaustPort.width)
      if (ts.exhaustPort.bridge) {
        const bridge = exHalf * 0.1
        portWindow(x, (exHalf + bridge) / 2, (exHalf - bridge) / 2, exhaustTop, bottomDead, 0xff6b3d, 'exhaust', i)
        portWindow(x, -(exHalf + bridge) / 2, (exHalf - bridge) / 2, exhaustTop, bottomDead, 0xff6b3d, 'exhaust', i)
      } else portWindow(x, 0, exHalf, exhaustTop, bottomDead, 0xff6b3d, 'exhaust', i)
      // Transfers flank the exhaust; a third or fifth is the rear boost port.
      const each = ts.transfers.width / ts.transfers.count
      const half = angleOf(each)
      const placed =
        ts.transfers.count === 2
          ? [1.75, -1.75]
          : ts.transfers.count === 3
            ? [1.75, -1.75, Math.PI]
            : [1.6, -1.6, 2.3, -2.3, Math.PI]
      for (const a of placed) portWindow(x, a, half, transferTop, bottomDead, 0x2fb8ff, 'transfer', i)
      if (ts.intake.kind === 'piston') {
        const lower = bottomDead - skirt + ts.intake.height
        portWindow(x, Math.PI, angleOf(ts.intake.width), lower + 0.3 * u, lower, 0x3be0b0, 'intake', i)
      }
      // Combustion chamber gas, piston, pin, rod and crank webs.
      const chamberMat = new THREE.MeshStandardMaterial({ color: 0xd7a356, emissive: 0xff7a12, transparent: true, opacity: 0.4, depthWrite: false })
      const chamber = mesh(new THREE.CylinderGeometry(radius * 0.97, radius * 0.97, 1, 32), chamberMat, x, deck, 0)
      chamber.userData.cylinder = i
      chambers.push(chamber)
      const piston = mesh(new THREE.CylinderGeometry(radius * 0.985, radius * 0.985, pistonHeight, 40), forged.clone(), x, deck - pistonHeight / 2, 0)
      ;(piston.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xff4b1f)
      piston.userData.cylinder = i
      pistons.push(piston)
      const pin = mesh(new THREE.CylinderGeometry(0.12 * u, 0.12 * u, 0.9 * u, 16), steel, x, 0, 0)
      pin.rotation.z = Math.PI / 2
      pins.push(pin)
      const rod = mesh(new THREE.BoxGeometry(0.16 * u, 1, 0.1 * u), forged, x, 0, 0)
      rods.push(rod)
      const web = new THREE.Group()
      web.position.set(x, crankY, 0)
      scene.add(web)
      for (const side of [-1, 1]) {
        const disc = mesh(new THREE.CylinderGeometry(r * 1.9, r * 1.9, 0.12 * u, 40), steel, side * 0.5 * u, 0, 0, web)
        disc.rotation.z = Math.PI / 2
      }
      webs.push(web)
      const plug = new THREE.MeshStandardMaterial({ color: 0x5a3d16, emissive: 0x7fd3ff, emissiveIntensity: 0 })
      mesh(new THREE.CylinderGeometry(0.06 * u, 0.06 * u, 0.3 * u, 12), plug, x, deck + 0.5 * u, 0)
      mesh(new THREE.CylinderGeometry(0.09 * u, 0.09 * u, 0.25 * u, 12), ceramic, x, deck + 0.75 * u, 0)
      sparks.push(plug)
      // Crankcase: the rear half, cut away at the front.
      const ccRadius = r * 2.3
      const crankcase = new THREE.CylinderGeometry(ccRadius, ccRadius, 1.35 * u, 40, 1, false, Math.PI / 2, Math.PI)
      const cc = mesh(crankcase, casting, x, crankY, 0)
      cc.rotation.z = Math.PI / 2
      if (ts.intake.kind === 'reed') {
        // Reed block on the crankcase behind the cylinder; petals open on depression.
        const block = new THREE.Group()
        block.position.set(x, crankY + ccRadius * 0.6, -ccRadius * 0.95)
        scene.add(block)
        mesh(new THREE.BoxGeometry(0.7 * u, 0.5 * u, 0.25 * u), casting, 0, 0, -0.12 * u, block)
        const petal = new THREE.Group()
        mesh(new THREE.BoxGeometry(0.6 * u, 0.45 * u, 0.01 * u), material(0x272727, { metalness: 0.2 }), 0, -0.22 * u, 0, petal)
        petal.position.set(0, 0.22 * u, 0.02 * u)
        block.add(petal)
        reeds.push(petal)
      }
      if (ts.intake.kind === 'rotary') {
        const disc = new THREE.Group()
        disc.position.set(x + 0.75 * u, crankY, 0)
        scene.add(disc)
        const shape = new THREE.Shape()
        const open = ((ts.intake.open + ts.intake.close) * Math.PI) / 180
        shape.absarc(0, 0, ccRadius * 0.9, open / 2, TAU - open / 2, false)
        shape.lineTo(0, 0)
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.02 * u, bevelEnabled: false, curveSegments: 32 })
        const m = mesh(g, material(0x3a3f2a, { metalness: 0.3 }), 0, 0, 0, disc)
        m.rotation.y = Math.PI / 2
        discs.push(disc)
      }
      // Exhaust pipe: a bend out of the port, then the segments along the
      // side (a single's to the right; a twin's outwards from each cylinder).
      const segments = pipeSegments(ts.pipe)
      const total = segments.reduce((s, g) => s + g.length, 0)
      const direction = n === 1 || i === 1 ? 1 : -1
      const portY = (exhaustTop + bottomDead) / 2
      const bend = Math.min(0.9 * u, segments[0].length * 0.6)
      const headerMat = new THREE.MeshStandardMaterial({ color: 0x9a8f86, metalness: 0.9, roughness: 0.35 })
      const stub = mesh(new THREE.CylinderGeometry(segments[0].start / 2, segments[0].start / 2, bend, 24), headerMat, x, portY, radius + bend / 2)
      stub.rotation.x = Math.PI / 2
      const points: THREE.Vector2[] = []
      const cells: number[] = []
      const step = Math.max(0.005, total / 160)
      let along = bend
      let start = 0
      for (const g of segments) {
        for (let s = 0; s <= g.length - 1e-9; s += step) {
          if (start + s < bend) continue
          points.push(new THREE.Vector2((g.start + (g.end - g.start) * (s / g.length)) / 2, start + s - bend))
          cells.push(start + s)
          along = start + s
        }
        start += g.length
      }
      points.push(new THREE.Vector2(segments[segments.length - 1].end / 2, total - bend))
      cells.push(total)
      void along
      const lathe = new THREE.LatheGeometry(points, 28)
      const colours = new Float32Array(lathe.attributes.position.count * 3).fill(0.5)
      lathe.setAttribute('color', new THREE.BufferAttribute(colours, 3))
      const pipeMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide })
      const pipe = mesh(lathe, pipeMat, x, portY, radius + bend)
      pipe.rotation.z = -direction * (Math.PI / 2)
      pipeMeshes.push({ geometry: lathe, cells: cells.map((c) => c / total) })
    }
    // Framing: the cylinder, or the whole pipe.
    const pipeLength = pipeSegments(ts.pipe).reduce((s, g) => s + g.length, 0)
    const extent = Math.max(deck + u, pipeLength + spacing * n)
    const camera = new THREE.PerspectiveCamera(37, 1, 0.005 * extent, 20 * extent)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const fit = (name: string) => {
      const engineCentre = new THREE.Vector3(0, deck * 0.45, 0)
      const target = name === 'Pipe' ? new THREE.Vector3((pipeLength / 2) * (n === 1 ? 1 : 0), deck * 0.4, radius + 0.6 * u) : engineCentre
      const span = name === 'Pipe' ? pipeLength * 0.75 + spacing * n : name === 'Overview' ? extent * 0.65 : deck * 1.1 + spacing * (n - 1)
      const direction = name === 'Pipe' ? new THREE.Vector3(0.25, 0.55, 1) : new THREE.Vector3(0.5, 0.35, 1)
      camera.position.copy(target).addScaledVector(direction.normalize(), span * 1.7)
      controls.target.copy(target)
      controls.minDistance = 0.3 * deck
      controls.maxDistance = 4 * extent
      controls.update()
    }
    cameraPreset.current = fit
    fit('Cylinder')
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
    scene.add(new THREE.HemisphereLight(0xc9d7df, 0x10161a, 0.7))
    const key = new THREE.DirectionalLight(0xfff5e8, 2.6)
    key.position.set(1, 2, 1.5)
    scene.add(key)
    const raycaster = new THREE.Raycaster()
    const click = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(
        new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1),
        camera,
      )
      const hit = raycaster.intersectObjects([...pistons, ...chambers], false).find((h) => typeof h.object.userData.cylinder === 'number')
      if (hit) options.current.onSelect(hit.object.userData.cylinder)
    }
    renderer.domElement.addEventListener('pointerup', click)
    const resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = Math.max(1, host.clientHeight - 112)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    resize.observe(host)
    const up = new THREE.Vector3(0, 1, 0)
    const colour = new THREE.Color()
    const phaseOffsets = engine.firingOrder.map((_, c) => (engine.firingOrder.indexOf(c + 1) * ts.crankPhase * Math.PI) / 180)
    let frame = 0,
      last = performance.now(),
      inspection = 0,
      lastSample = -1,
      receivedAt = performance.now()
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
      inspection = wrapRev(inspection + dt * Math.PI * 0.5)
      const angle = options.current.slow
        ? inspection
        : (t?.angle ?? 0) + (t ? ((t.rpm * Math.PI) / 30) * Math.min((now - receivedAt) / 1000, 0.1) : 0)
      const valve = t?.twoStroke?.powerValve ?? 1
      const drop = ts.powerValve ? ts.powerValve.drop * (1 - valve) : 0
      for (let i = 0; i < n; i++) {
        const phase = wrapRev(angle - phaseOffsets[i])
        const travel = pistonTravel(phase, engine.stroke as Metres, engine.rodLength as Metres)
        const crown = deck - travel
        pistons[i].position.y = crown - pistonHeight / 2
        const pinY = crown - pinBelowCrown
        pins[i].position.y = pinY
        const crank = new THREE.Vector3(pistons[i].position.x, crankY + r * Math.cos(phase), r * Math.sin(phase))
        const pin = new THREE.Vector3(pistons[i].position.x, pinY, 0)
        rods[i].position.copy(crank).add(pin).multiplyScalar(0.5)
        rods[i].scale.y = crank.distanceTo(pin)
        rods[i].quaternion.setFromUnitVectors(up, pin.clone().sub(crank).normalize())
        webs[i].rotation.x = phase
        if (discs[i]) discs[i].rotation.x = phase
        const degrees = (phase * 180) / Math.PI
        const name = twoStrokePhase(degrees, timing)
        const c = phaseColours[name]
        const mat = chambers[i].material as THREE.MeshStandardMaterial
        mat.color.setHex(options.current.overlays ? c : 0xd7a356)
        mat.emissive.setHex(c)
        mat.opacity = options.current.overlays ? 0.75 : 0.15
        mat.emissiveIntensity = (options.current.selected === i ? 1.4 : 0.5) + (options.current.overlays && name === 'Power' ? 1 : 0)
        const height = Math.max(0.02 * u, travel)
        chambers[i].scale.y = height
        chambers[i].position.y = deck - height / 2
        ;(pistons[i].material as THREE.MeshStandardMaterial).emissiveIntensity = t ? Math.min(1.2, Math.max(0, (t.temperatures.crown[i] - 523) / 110)) : 0
        const advance = t ? t.ecu.advance - t.knock.retard[i] : engine.ignitionAdvance
        const sinceSpark = wrapRev(phase + (advance * Math.PI) / 180)
        sparks[i].emissiveIntensity = sinceSpark < ((advance + 25) * Math.PI) / 180 ? 6 : 0
        // A port glows while the crown (or, for the intake, the skirt) has uncovered it.
        const skirtBottom = crown - skirt
        for (const p of ports)
          if (p.cylinder === i) {
            const open =
              p.kind === 'intake' ? skirtBottom > p.top - 0.3 * u : crown < p.top - (p.kind === 'exhaust' ? drop : 0)
            p.mat.emissiveIntensity = open ? 1.6 : 0.12
            p.mat.opacity = open ? 0.95 : 0.5
          }
        if (reeds[i]) reeds[i].rotation.x = -0.5 * (options.current.slow ? 0 : (t?.twoStroke?.reed?.[i] ?? 0))
        // Pipe pressure from the snapshot nearest this crank angle.
        const wave = t?.twoStroke?.pipeWave[i]
        const cells = t?.twoStroke?.pipeCells ?? 0
        const geometry = pipeMeshes[i].geometry
        const attribute = geometry.attributes.color as THREE.BufferAttribute
        if (wave && cells > 0 && wave.length === cells * WAVE_SNAPSHOTS) {
          const slot = Math.floor((phase / TAU) * WAVE_SNAPSHOTS) % WAVE_SNAPSHOTS
          const rows = pipeMeshes[i].cells
          const segmentsAround = 29
          for (let row = 0; row < rows.length; row++) {
            const cell = Math.min(cells - 1, Math.floor(rows[row] * cells))
            pressureColour(wave[slot * cells + cell] - 101325, colour)
            for (let k = 0; k < segmentsAround; k++) {
              const v = k * rows.length + row
              if (v * 3 + 2 < attribute.array.length) attribute.setXYZ(v, colour.r, colour.g, colour.b)
            }
          }
          attribute.needsUpdate = true
        }
      }
      controls.update()
      renderer.render(scene, camera)
    }
    animate()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      cameraPreset.current = null
      controls.dispose()
      renderer.domElement.removeEventListener('pointerup', click)
      for (const m of meshes) {
        m.geometry.dispose()
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        for (const mat of mats) mat.dispose()
      }
      scene.environment?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
    // portTiming is derived from the engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, telemetry])
  const cylinders = Array.from({ length: engine.cylinders }, (_, i) => i)
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
            ? 'INSPECTION · 15 RPM · sound muted · pipe waves from the last revolution'
            : `LIVE CUTAWAY · TWO-STROKE ${engine.cylinders === 1 ? 'SINGLE' : 'TWIN'}`}
        </span>
        <span>Ports glow while open · pipe: blue suction, orange pressure</span>
      </div>
      <div className="camera-presets" role="group" aria-label="Engine camera views">
        {['Cylinder', 'Pipe', 'Overview'].map((name) => (
          <button key={name} type="button" disabled={failed} onClick={() => cameraPreset.current?.(name)} aria-label={`${name} camera view`}>
            {name}
          </button>
        ))}
      </div>
      <div className="cylinder-selector">
        {cylinders.map((i) => (
          <button key={i} className={selected === i ? 'selected' : ''} onClick={() => onSelect(i)} aria-label={`Inspect cylinder ${i + 1}`}>
            CYL {i + 1}
            <small>{twoStrokePhase(telemetry.current?.phases[i] ?? 0, timing)}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
