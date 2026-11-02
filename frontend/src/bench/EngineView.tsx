import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { EngineDefinition, Metres } from '../sim/schema'
import type { Telemetry } from '../sim/core'
import { pistonTravel, phaseName, wrap } from '../sim/physics'

// Power, exhaust, intake, compression.
const phaseColours = [0xff7a12, 0xff3b6b, 0x1fc8ff, 0x9d6bff]
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
  /** Camera kept across rebuilds (live edits), relative to block size. */
  const view = useRef<{
    position: THREE.Vector3
    target: THREE.Vector3
    size: number
  } | null>(null)
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
    renderer.toneMappingExposure = 1.1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
    const kept = view.current
    if (kept) {
      camera.position.copy(kept.position).multiplyScalar(size / kept.size)
      controls.target.copy(kept.target).multiplyScalar(size / kept.size)
    }
    controls.enableDamping = true
    controls.minDistance = 0.35 * size
    controls.maxDistance = 1.6 * size
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a242c, 0.9))
    const key = new THREE.DirectionalLight(0xfff1dd, 2.6)
    key.position.set(0.8 * size, 1.6 * size, 1.1 * size)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.bias = -0.0005
    const reach = 0.6 * Math.max(size, 1)
    Object.assign(key.shadow.camera, {
      left: -reach,
      right: reach,
      top: reach,
      bottom: -reach,
      far: 6 * Math.max(size, 1),
    })
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xff9a3c, 2.2)
    rim.position.set(-1.2 * size, 0.6 * size, -1 * size)
    scene.add(rim)
    const fill = new THREE.DirectionalLight(0x5fb8ff, 1.1)
    fill.position.set(-1 * size, 0.3 * size, 1 * size)
    scene.add(fill)
    const steel = new THREE.MeshStandardMaterial({
      color: 0xdfe5ea,
      metalness: 1,
      roughness: 0.22,
    })
    const aluminium = new THREE.MeshStandardMaterial({
      color: 0xeef1f4,
      metalness: 0.85,
      roughness: 0.32,
    })
    const forged = new THREE.MeshStandardMaterial({
      color: 0x7d8b99,
      metalness: 1,
      roughness: 0.38,
    })
    const brass = new THREE.MeshStandardMaterial({
      color: 0xf0b041,
      metalness: 1,
      roughness: 0.25,
    })
    const paint = new THREE.MeshPhysicalMaterial({
      color: 0xd8262e,
      metalness: 0.2,
      roughness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    })
    const casting = new THREE.MeshStandardMaterial({
      color: 0x24323d,
      metalness: 0.55,
      roughness: 0.55,
    })
    const ceramic = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.3,
    })
    const cylinderMat = new THREE.MeshPhysicalMaterial({
      color: 0xa9dcff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      metalness: 0.1,
      roughness: 0.05,
    })
    const meshes: THREE.Mesh[] = []
    const pistons: THREE.Mesh[] = [],
      rods: THREE.Mesh[] = [],
      pins: THREE.Mesh[] = [],
      throws: THREE.Group[] = [],
      sparks: THREE.MeshStandardMaterial[] = [],
      chambers: THREE.Mesh[] = [],
      valves: THREE.Mesh[][] = []
    function mesh(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) {
      const m = new THREE.Mesh(geometry, material)
      m.position.set(x, y, z)
      m.castShadow = true
      m.receiveShadow = true
      parent.add(m)
      meshes.push(m)
      return m
    }
    // Every part is sized from the bore so tiny and huge builds keep their look.
    const u = engine.bore
    const spacing = u * 1.18
    const width = spacing * 4 + 0.35 * u
    const r = engine.stroke / 2
    const pistonHeight = 0.62 * u
    const crown = pistonHeight / 2
    const head =
      engine.rodLength + r + crown + engine.stroke / (engine.compression - 1)
    const baseY = -(r + 0.45 * u)
    const groundY = -0.15 * size
    const backZ = -0.66 * u
    // Cutaway: the block, head and cam cover are drawn behind the bore centres.
    const blockTop = head + 0.05 * u
    mesh(
      new THREE.BoxGeometry(width, blockTop - baseY, 0.12 * u),
      casting,
      0,
      (blockTop + baseY) / 2,
      backZ,
    )
    const headHeight = 0.42 * u
    mesh(
      new THREE.BoxGeometry(width, headHeight, 0.62 * u),
      casting,
      0,
      head + 0.24 * u + headHeight / 2,
      -0.36 * u,
    )
    const cover = mesh(
      new THREE.CylinderGeometry(
        0.42 * u,
        0.42 * u,
        width * 0.98,
        40,
        1,
        false,
        0,
        Math.PI,
      ),
      paint,
      0,
      head + 0.24 * u + headHeight,
      -0.36 * u,
    )
    cover.rotation.z = Math.PI / 2
    cover.scale.set(1, 1, 0.75)
    mesh(new THREE.BoxGeometry(width, 0.12 * u, 1.5 * u), casting, 0, baseY, 0)
    const crank = mesh(
      new THREE.CylinderGeometry(0.14 * u, 0.14 * u, width, 32),
      steel,
      0,
      0,
      0,
    )
    crank.rotation.z = Math.PI / 2
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * spacing
      const piston = mesh(
        new THREE.CylinderGeometry(0.475 * u, 0.465 * u, pistonHeight, 40),
        aluminium,
        x,
        0.16,
        0,
      )
      piston.userData.cylinder = i
      for (const y of [crown - 0.1 * u, crown - 0.2 * u]) {
        const ring = mesh(
          new THREE.TorusGeometry(0.476 * u, 0.012 * u, 8, 40),
          forged,
          0,
          y,
          0,
          piston,
        )
        ring.rotation.x = Math.PI / 2
      }
      pistons.push(piston)
      const sleeve = mesh(
        new THREE.CylinderGeometry(
          0.51 * u,
          0.51 * u,
          engine.stroke + pistonHeight,
          48,
          1,
          true,
        ),
        cylinderMat,
        x,
        engine.rodLength + crown,
        0,
      )
      sleeve.castShadow = false
      sleeve.userData.cylinder = i
      for (const y of [engine.rodLength - r, head])
        mesh(
          new THREE.TorusGeometry(0.52 * u, 0.025 * u, 10, 48),
          brass,
          x,
          y,
          0,
        ).rotation.x = Math.PI / 2
      rods.push(
        mesh(
          new THREE.CylinderGeometry(0.08 * u, 0.12 * u, 1, 16),
          forged,
          x,
          0.08,
          0,
        ),
      )
      const pin = mesh(
        new THREE.CylinderGeometry(0.15 * u, 0.15 * u, 0.32 * u, 24),
        brass,
        x,
        0,
        r,
      )
      pin.rotation.z = Math.PI / 2
      pins.push(pin)
      // Crank throw: two webs and a counterweight rotating with the pin.
      const throwGroup = new THREE.Group()
      throwGroup.position.x = x
      scene.add(throwGroup)
      throws.push(throwGroup)
      for (const side of [-1, 1])
        mesh(
          new THREE.BoxGeometry(0.1 * u, r + 0.4 * u, 0.42 * u),
          steel,
          side * 0.21 * u,
          (r - 0.4 * u) / 2,
          0,
          throwGroup,
        )
      const weight = mesh(
        new THREE.CylinderGeometry(
          r * 0.55 + 0.3 * u,
          r * 0.55 + 0.3 * u,
          0.5 * u,
          32,
          1,
          false,
          Math.PI / 2,
          Math.PI,
        ),
        forged,
        0,
        -0.1 * u,
        0,
        throwGroup,
      )
      weight.rotation.z = Math.PI / 2
      const gas = mesh(
        new THREE.CylinderGeometry(0.47 * u, 0.47 * u, 1, 32),
        new THREE.MeshStandardMaterial({
          color: phaseColours[0],
          emissive: phaseColours[0],
          emissiveIntensity: 0.6,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          // Keep phase colours saturated rather than tone-mapped to pastel.
          toneMapped: false,
        }),
        x,
        head - 0.1 * u,
        0,
      )
      gas.castShadow = false
      gas.userData.cylinder = i
      chambers.push(gas)
      const pair = [-1, 1].map((v) => {
        const valve = mesh(
          new THREE.CylinderGeometry(0.17 * u, 0.12 * u, 0.05 * u, 24),
          v < 0 ? steel : brass,
          x,
          head + 0.16 * u,
          v * 0.24 * u,
        )
        mesh(
          new THREE.CylinderGeometry(0.03 * u, 0.03 * u, 0.4 * u, 8),
          steel,
          0,
          0.22 * u,
          0,
          valve,
        )
        return valve
      })
      valves.push(pair)
      mesh(
        new THREE.CylinderGeometry(0.07 * u, 0.07 * u, 0.5 * u, 12),
        ceramic,
        x,
        head + 0.5 * u,
        0,
      )
      const spark = new THREE.MeshStandardMaterial({
        color: 0xffd36b,
        emissive: 0xffa21f,
        emissiveIntensity: 0,
      })
      sparks.push(spark)
      mesh(
        new THREE.SphereGeometry(0.07 * u, 12, 10),
        spark,
        x,
        head + 0.02 * u,
        0,
      ).castShadow = false
      const bearing = mesh(
        new THREE.CylinderGeometry(0.26 * u, 0.26 * u, 0.16 * u, 32),
        brass,
        x + spacing / 2,
        0,
        0,
      )
      bearing.rotation.z = Math.PI / 2
    }
    for (const x of [-width / 2, width / 2]) {
      mesh(
        new THREE.BoxGeometry(0.14 * u, r + 0.9 * u, 1.4 * u),
        casting,
        x,
        baseY + (r + 0.9 * u) / 2,
        0,
      )
      for (const z of [-0.6 * u, 0.6 * u])
        mesh(
          new THREE.CylinderGeometry(0.08 * u, 0.12 * u, baseY - groundY, 12),
          paint,
          x,
          (baseY + groundY) / 2,
          z,
        )
    }
    const flywheel = new THREE.Group()
    flywheel.position.x = width / 2 + 0.3 * u
    scene.add(flywheel)
    mesh(
      new THREE.CylinderGeometry(0.85 * u, 0.85 * u, 0.16 * u, 64),
      forged,
      0,
      0,
      0,
      flywheel,
    ).rotation.z = Math.PI / 2
    mesh(
      new THREE.TorusGeometry(0.85 * u, 0.04 * u, 8, 64),
      brass,
      0,
      0,
      0,
      flywheel,
    ).rotation.y = Math.PI / 2
    // Timing mark makes rotation visible even at a glance.
    mesh(
      new THREE.BoxGeometry(0.18 * u, 0.3 * u, 0.08 * u),
      paint,
      0,
      0.62 * u,
      0,
      flywheel,
    )
    // Forced induction: drawn at the front (-x) of the block, sized from the bore.
    const induction = engine.induction
    const spinner = new THREE.Group()
    let hotHousing: THREE.MeshStandardMaterial | null = null
    const frontX = -width / 2
    const beltPulley = (x: number, y: number, z: number, radius: number) => {
      mesh(
        new THREE.CylinderGeometry(radius, radius, 0.12 * u, 32),
        steel,
        x,
        y,
        z,
      ).rotation.z = Math.PI / 2
    }
    const belt = (y1: number, z1: number, y2: number, z2: number) => {
      const dy = y2 - y1,
        dz = z2 - z1
      const strap = mesh(
        new THREE.BoxGeometry(0.06 * u, Math.hypot(dy, dz), 0.04 * u),
        new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.9 }),
        frontX - 0.25 * u,
        (y1 + y2) / 2,
        (z1 + z2) / 2,
      )
      strap.rotation.x = -Math.atan2(dz, dy)
    }
    if (induction.kind === 'turbo') {
      hotHousing = new THREE.MeshStandardMaterial({
        color: 0x5a5049,
        metalness: 0.6,
        roughness: 0.45,
        emissive: 0xff4a12,
        emissiveIntensity: 0,
      })
      const turbo = new THREE.Group()
      turbo.position.set(frontX - 0.75 * u, head * 0.75, -0.25 * u)
      scene.add(turbo)
      const scale = Math.max(
        0.6 * u,
        (induction.compressorDiameter / 0.05) * 0.6 * u,
      )
      mesh(
        new THREE.TorusGeometry(0.55 * scale, 0.32 * scale, 16, 40),
        hotHousing,
        0,
        0,
        -0.5 * scale,
        turbo,
      )
      mesh(
        new THREE.TorusGeometry(0.62 * scale, 0.3 * scale, 16, 40),
        aluminium,
        0,
        0,
        0.55 * scale,
        turbo,
      )
      mesh(
        new THREE.CylinderGeometry(0.22 * scale, 0.22 * scale, 0.9 * scale, 24),
        brass,
        0,
        0,
        0,
        turbo,
      ).rotation.x = Math.PI / 2
      // Compressor inlet with a visible wheel.
      mesh(
        new THREE.CylinderGeometry(
          0.42 * scale,
          0.42 * scale,
          0.5 * scale,
          32,
          1,
          true,
        ),
        aluminium,
        0,
        0,
        1.05 * scale,
        turbo,
      ).rotation.x = Math.PI / 2
      spinner.position.set(0, 0, 1.0 * scale)
      turbo.add(spinner)
      for (let b = 0; b < 7; b++)
        mesh(
          new THREE.BoxGeometry(0.06 * scale, 0.7 * scale, 0.25 * scale),
          steel,
          0,
          0,
          0,
          spinner,
        ).rotation.z = (b * Math.PI) / 7
      // Downpipe to the floor side.
      mesh(
        new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, head * 0.6, 20),
        hotHousing,
        0,
        -head * 0.35,
        -0.5 * scale,
        turbo,
      )
    } else if (induction.kind === 'centrifugal') {
      const y = 0.6 * head
      const z = 0.9 * u
      const housing = new THREE.Group()
      housing.position.set(frontX - 0.45 * u, y, z)
      scene.add(housing)
      const scale = (induction.compressorDiameter / 0.085) * 0.75 * u
      mesh(
        new THREE.TorusGeometry(0.55 * scale, 0.3 * scale, 16, 40),
        aluminium,
        0,
        0,
        0,
        housing,
      ).rotation.y = Math.PI / 2
      mesh(
        new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 0.6 * scale, 32),
        paint,
        0.3 * scale,
        0,
        0,
        housing,
      ).rotation.z = Math.PI / 2
      spinner.position.set(-0.32 * scale, 0, 0)
      housing.add(spinner)
      for (let b = 0; b < 7; b++)
        mesh(
          new THREE.BoxGeometry(0.05 * scale, 0.7 * scale, 0.05 * scale),
          steel,
          0,
          0,
          0,
          spinner,
        ).rotation.x = (b * Math.PI) / 7
      beltPulley(frontX - 0.25 * u, 0, 0, 0.45 * u)
      beltPulley(frontX - 0.25 * u, y, z, 0.18 * u)
      belt(0, 0, y, z)
    } else if (induction.kind === 'roots') {
      const top = head + 0.24 * u + 0.42 * u + 0.3 * u
      const blower = mesh(
        new THREE.BoxGeometry(width * 0.7, 0.55 * u, 0.7 * u),
        paint,
        -0.1 * width,
        top + 0.28 * u,
        -0.36 * u,
      )
      blower.castShadow = true
      for (let f = 0; f < 7; f++)
        mesh(
          new THREE.BoxGeometry(0.04 * u, 0.6 * u, 0.74 * u),
          aluminium,
          -0.1 * width - width * 0.3 + (f * width * 0.6) / 6,
          top + 0.28 * u,
          -0.36 * u,
        )
      const pulleyY = top + 0.28 * u
      const pulleyX = -0.1 * width - width * 0.35 - 0.1 * u
      spinner.position.set(pulleyX, pulleyY, -0.36 * u)
      scene.add(spinner)
      mesh(
        new THREE.CylinderGeometry(0.3 * u, 0.3 * u, 0.12 * u, 32),
        steel,
        0,
        0,
        0,
        spinner,
      ).rotation.z = Math.PI / 2
      mesh(
        new THREE.BoxGeometry(0.13 * u, 0.5 * u, 0.06 * u),
        brass,
        0,
        0,
        0,
        spinner,
      )
      beltPulley(frontX - 0.25 * u, 0, 0, 0.45 * u)
      belt(0, 0, pulleyY, -0.36 * u)
    }
    // Fuel system on the intake (-z) side, raised above the cam cover so it
    // reads from the default view: a plenum on runners carrying the
    // carburettor or throttle body, injectors in the runners, or (direct
    // injection) injectors beside the spark plugs.
    const fuelSystem = engine.fuelSystem
    const injectorTip = new THREE.MeshStandardMaterial({
      color: 0x3f8fd8,
      roughness: 0.4,
    })
    const injector = (x: number, y: number, z: number, tilt: number) => {
      mesh(
        new THREE.CylinderGeometry(0.06 * u, 0.04 * u, 0.36 * u, 12),
        injectorTip,
        x,
        y,
        z,
      ).rotation.x = tilt
    }
    if (fuelSystem.kind === 'direct')
      for (let i = 0; i < 4; i++)
        injector((i - 1.5) * spacing + 0.22 * u, head + 0.45 * u, 0, -0.35)
    else {
      const plenumY = head + 1.0 * u
      const plenumZ = -1.0 * u
      for (let i = 0; i < 4; i++)
        mesh(
          new THREE.BoxGeometry(0.34 * u, 0.6 * u, 0.3 * u),
          aluminium,
          (i - 1.5) * spacing,
          head + 0.62 * u,
          -0.82 * u,
        )
      mesh(
        new THREE.BoxGeometry(width * 0.85, 0.34 * u, 0.42 * u),
        aluminium,
        0,
        plenumY,
        plenumZ,
      ).castShadow = true
      if (fuelSystem.kind === 'port')
        for (let i = 0; i < 4; i++)
          injector((i - 1.5) * spacing, plenumY + 0.1 * u, -0.7 * u, 0.5)
      else {
        // Carburettor barrels (up to four drawn) or a single throttle body.
        const barrels =
          fuelSystem.kind === 'carburettor' ? Math.min(fuelSystem.chokes, 4) : 1
        const bore =
          fuelSystem.kind === 'carburettor'
            ? (fuelSystem.chokeDiameter / 0.032) * 0.16 * u
            : 0.2 * u
        for (let b = 0; b < barrels; b++)
          mesh(
            new THREE.CylinderGeometry(bore * 1.25, bore * 1.25, 0.42 * u, 24),
            brass,
            (b - (barrels - 1) / 2) * (2.6 * bore + 0.05 * u),
            plenumY + 0.38 * u,
            plenumZ,
          )
        const filter = Math.max(0.4 * u, barrels * 1.5 * bore)
        mesh(
          new THREE.CylinderGeometry(filter, filter, 0.16 * u, 32),
          paint,
          0,
          plenumY + 0.66 * u,
          plenumZ,
        ).castShadow = true
        if (fuelSystem.kind === 'throttleBody')
          injector(0, plenumY + 0.86 * u, plenumZ, 0)
      }
    }
    // Exhaust system on the +z side, drawn from the build's exhaust settings:
    // headers sized by length, a 4-1 or 4-2-1 merge, catalyst, silencer and
    // tailpipe. It glows with the header wall temperature and flashes on
    // afterfire; both come from telemetry.
    const exhaust = engine.exhaust
    const hotPipe = new THREE.MeshStandardMaterial({
      color: 0x6b5d52,
      metalness: 0.75,
      roughness: 0.35,
      emissive: 0xff4a12,
      emissiveIntensity: 0,
    })
    const flash = new THREE.MeshStandardMaterial({
      color: 0xffb347,
      emissive: 0xff8a1f,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const pipeRadius = 0.11 * u
    const tube = (points: THREE.Vector3[], radius = pipeRadius) => {
      const curve = new THREE.CatmullRomCurve3(points)
      mesh(new THREE.TubeGeometry(curve, 24, radius, 12), hotPipe, 0, 0, 0)
    }
    // Headers run across the top front of the head to a collector past the
    // flywheel end, keeping the open cutaway clear; longer headers put the
    // collector further out. The system then runs back along that side.
    const portY = head + 0.18 * u
    const frontZ = 0.95 * u
    const ports = [0, 1, 2, 3].map(
      (i) => new THREE.Vector3((i - 1.5) * spacing, portY, 0.4 * u),
    )
    const bend = (p: THREE.Vector3) =>
      new THREE.Vector3(p.x, portY + 0.14 * u, frontZ)
    const headerReach =
      Math.min(3, Math.max(0.4, exhaust.headerLength / 0.5)) * 0.7 * u
    const collector = new THREE.Vector3(
      width / 2 + 0.9 * u + headerReach,
      portY,
      frontZ,
    )
    if (exhaust.collector === '4-2-1') {
      // Cylinders 1 and 4, and 2 and 3, pair up (180° apart in the firing order).
      const pairs = [
        [0, 3, 0.18],
        [1, 2, -0.18],
      ]
      for (const [a, b, lift] of pairs) {
        const merge = new THREE.Vector3(
          (ports[b].x + collector.x) / 2,
          portY + 0.14 * u + lift * u,
          frontZ + 0.1 * u,
        )
        for (const i of [a, b]) tube([ports[i], bend(ports[i]), merge])
        tube([merge, collector], pipeRadius * 1.25)
      }
    } else
      for (const port of ports) tube([port, bend(port), collector])
    // Down past the flywheel, then back along the side: catalyst, silencer, tip.
    const runY = Math.max(groundY + 0.25 * u, baseY - 0.2 * u)
    const length = Math.min(
      2.2 * u * 3,
      Math.max(1.6 * u, (exhaust.tailpipeLength / 2.5) * 4.4 * u),
    )
    const runX = collector.x
    const endZ = frontZ - length
    tube(
      [
        collector,
        new THREE.Vector3(runX, (collector.y + runY) / 2, frontZ),
        new THREE.Vector3(runX, runY, frontZ - 0.3 * u),
        new THREE.Vector3(runX, runY, endZ),
      ],
      pipeRadius * 1.3,
    )
    const along = (share: number) => frontZ - 0.3 * u - share * (length - 0.3 * u)
    if (exhaust.catalyst)
      mesh(
        new THREE.CylinderGeometry(0.3 * u, 0.3 * u, 0.7 * u, 24),
        ceramic,
        runX,
        runY,
        along(0.2),
      ).rotation.x = Math.PI / 2
    if (exhaust.silencer !== 'straight') {
      const chambered = exhaust.silencer === 'chambered'
      const can = mesh(
        new THREE.CylinderGeometry(
          chambered ? 0.42 * u : 0.26 * u,
          chambered ? 0.42 * u : 0.26 * u,
          chambered ? 1.1 * u : 1.5 * u,
          32,
        ),
        chambered ? steel : aluminium,
        runX,
        runY,
        along(0.68),
      )
      can.rotation.x = Math.PI / 2
      if (chambered) can.scale.set(1, 1, 0.7)
    }
    const tip = mesh(
      new THREE.CylinderGeometry(pipeRadius * 1.6, pipeRadius * 1.3, 0.3 * u, 20),
      steel,
      runX,
      runY,
      endZ,
    )
    tip.rotation.x = Math.PI / 2
    const fire = mesh(
      new THREE.SphereGeometry(0.35 * u, 16, 12),
      flash,
      runX,
      runY,
      endZ - 0.35 * u,
    )
    fire.castShadow = false
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.2 * Math.max(size, 1), 64),
      new THREE.ShadowMaterial({ opacity: 0.35 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = groundY + 0.001 * size
    floor.receiveShadow = true
    scene.add(floor)
    meshes.push(floor)
    const grid = new THREE.GridHelper(1.6, 32, 0x3a7aa0, 0x22323d)
    grid.scale.setScalar(Math.max(size, 1))
    grid.position.y = groundY
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
        throws[i].rotation.x = phase
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
            : 0.72
          : 0.12
        material.emissiveIntensity =
          (options.current.selected === i ? 1.4 : 0.5) +
          (options.current.overlays && degrees < 65 ? 1.2 : 0)
        // Spark flashes from ignition until early in the power stroke.
        const sinceSpark = wrap(
          phase + (engine.ignitionAdvance * Math.PI) / 180,
        )
        sparks[i].emissiveIntensity =
          sinceSpark < (engine.ignitionAdvance + 25) * (Math.PI / 180) ? 6 : 0
        const height = Math.max(0.02 * u, head - y - crown)
        chambers[i].scale.y = height
        chambers[i].position.y = y + crown + height / 2
        const lift = 0.1 * u
        valves[i][0].position.y =
          head +
          0.16 * u -
          (degrees >= 350 && degrees < engine.intakeClose
            ? lift *
              Math.sin((Math.PI * (degrees - 350)) / (engine.intakeClose - 350))
            : 0)
        valves[i][1].position.y =
          head +
          0.16 * u -
          (degrees >= 145 && degrees < 370
            ? lift * Math.sin((Math.PI * (degrees - 145)) / 225)
            : 0)
      }
      flywheel.rotation.x = angle
      if (t) {
        // Visible from about 400 °C, bright by 800 °C.
        hotPipe.emissiveIntensity = Math.min(
          1.6,
          Math.max(0, (t.exhaustWall - 673) / 250),
        )
        const pop = t.afterfire && !options.current.slow ? 1 : 0
        flash.opacity += (pop * 0.85 - flash.opacity) * 0.5
        flash.emissiveIntensity = flash.opacity * 4
        fire.scale.setScalar(0.6 + flash.opacity)
      }
      if (t && t.induction.kind !== 'none') {
        // Shown far slower than the real shaft so the rotation stays readable.
        const rate =
          (t.induction.shaftRpm * Math.PI) /
          30 /
          (t.induction.kind === 'roots' ? 20 : 400)
        const slowRate = options.current.slow ? 0 : rate
        if (t.induction.kind === 'centrifugal' || t.induction.kind === 'roots')
          spinner.rotation.x += slowRate * dt
        else spinner.rotation.z += slowRate * dt
        if (hotHousing)
          hotHousing.emissiveIntensity = Math.min(
            1.5,
            Math.max(0, t.induction.boost / 1e5) * 1.2,
          )
      }
      controls.update()
      renderer.render(scene, camera)
    }
    animate()
    return () => {
      view.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
        size,
      }
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
      environment.dispose()
      pmrem.dispose()
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
