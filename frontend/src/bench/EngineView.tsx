import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { EngineDefinition, Metres } from '../sim/schema'
import type { Telemetry } from '../sim/core'
import { pistonTravel, phaseName, wrap } from '../sim/physics'
import {
  emptyEvents,
  floatedLiftAt,
  floatSeverity,
  valveEvents,
} from '../sim/cams'

/** Drawn valve lift for a real lift, m: 9 mm draws 0.1 units. */
const drawnLift = (lift: number) =>
  0.1 * Math.min(1.6, Math.max(0.5, lift / 0.009))

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
  const cameraPreset = useRef<((name: string) => void) | null>(null)
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
    renderer.toneMappingExposure = 0.95
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
    camera.position.set(0.38 * size, 0.33 * size, 0.58 * size)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.105 * size, 0)
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
    scene.add(new THREE.HemisphereLight(0xc9d7df, 0x10161a, 0.65))
    const key = new THREE.DirectionalLight(0xfff5e8, 3.1)
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
    const rim = new THREE.DirectionalLight(0x9ec9df, 1.8)
    rim.position.set(-1.2 * size, 0.6 * size, -1 * size)
    scene.add(rim)
    const fill = new THREE.DirectionalLight(0x8bb6ce, 0.85)
    fill.position.set(-1 * size, 0.3 * size, 1 * size)
    scene.add(fill)
    // Small deterministic grain map: local asset, no network or random rebuilds.
    const grainPixels = new Uint8Array(64 * 64 * 4)
    let grainSeed = 173
    for (let i = 0; i < grainPixels.length; i += 4) {
      grainSeed = (Math.imul(grainSeed, 1664525) + 1013904223) >>> 0
      const value = 170 + (grainSeed >>> 26)
      grainPixels.set([value, value, value, 255], i)
    }
    const castingGrain = new THREE.DataTexture(grainPixels, 64, 64)
    castingGrain.wrapS = castingGrain.wrapT = THREE.RepeatWrapping
    castingGrain.repeat.set(6, 6)
    castingGrain.magFilter = THREE.LinearFilter
    castingGrain.minFilter = THREE.LinearMipmapLinearFilter
    castingGrain.generateMipmaps = true
    castingGrain.needsUpdate = true
    const steel = new THREE.MeshStandardMaterial({
      color: 0xaeb7bd,
      metalness: 1,
      roughness: 0.3,
    })
    const aluminium = new THREE.MeshStandardMaterial({
      color: 0xb8bec0,
      metalness: 0.88,
      roughness: 0.36,
    })
    const forged = new THREE.MeshStandardMaterial({
      color: 0x697175,
      metalness: 0.9,
      roughness: 0.48,
    })
    const brass = new THREE.MeshStandardMaterial({
      color: 0x9a7543,
      metalness: 0.85,
      roughness: 0.38,
    })
    const paint = new THREE.MeshPhysicalMaterial({
      color: 0x6e161b,
      metalness: 0.3,
      roughness: 0.3,
      clearcoat: 0.75,
      clearcoatRoughness: 0.22,
    })
    const casting = new THREE.MeshStandardMaterial({
      color: 0x252b2e,
      metalness: 0.62,
      roughness: 0.86,
      roughnessMap: castingGrain,
      bumpMap: castingGrain,
      bumpScale: engine.bore * 0.002,
    })
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x15191b,
      metalness: 0.68,
      roughness: 0.58,
    })
    const standPaint = new THREE.MeshStandardMaterial({
      color: 0x30383d,
      metalness: 0.7,
      roughness: 0.42,
    })
    const ceramic = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.3,
    })
    const cylinderMat = new THREE.MeshPhysicalMaterial({
      color: 0x91a5ad,
      transparent: true,
      opacity: 0.075,
      side: THREE.DoubleSide,
      depthWrite: false,
      metalness: 0.25,
      roughness: 0.2,
    })
    const meshes: THREE.Mesh[] = []
    const pistons: THREE.Mesh[] = [],
      rods: THREE.Group[] = [],
      pins: THREE.Mesh[] = [],
      throws: THREE.Group[] = [],
      sparks: THREE.MeshStandardMaterial[] = [],
      chambers: THREE.Mesh[] = [],
      valves: THREE.Mesh[][] = [],
      cams: THREE.Group[] = []
    const valveSprings: THREE.Mesh[][] = []
    const timingPulleys: { group: THREE.Group; ratio: number }[] = []
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
    const roundedBox = (x: number, y: number, z: number, radius: number) =>
      new RoundedBoxGeometry(x, y, z, 3, radius)
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
      roundedBox(width, blockTop - baseY, 0.18 * u, 0.045 * u),
      casting,
      0,
      (blockTop + baseY) / 2,
      backZ,
    )
    // Solid rear half-bores leave the front open, with actual wall thickness
    // and machined section faces rather than transparent floating sleeves.
    const halfBore = (inner: number, outer: number, height: number) => {
      const section = new THREE.Shape()
      section.absarc(0, 0, outer, Math.PI, Math.PI * 2, false)
      section.lineTo(inner, 0)
      section.absarc(0, 0, inner, Math.PI * 2, Math.PI, true)
      section.closePath()
      const geometry = new THREE.ExtrudeGeometry(section, {
        depth: height, bevelEnabled: false, curveSegments: 32,
      })
      geometry.rotateX(Math.PI / 2)
      return geometry
    }
    const boreBottom = engine.rodLength - r - crown
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * spacing
      mesh(halfBore(0.505 * u, 0.59 * u, head - boreBottom),
        casting, x, head, 0)
      mesh(halfBore(0.5 * u, 0.518 * u, head - boreBottom),
        steel, x, head, 0)
      mesh(halfBore(0.5 * u, 0.59 * u, 0.035 * u),
        aluminium, x, head + 0.035 * u, 0)
    }
    // End bulkheads and a rear crankcase rail tie the casting together.
    for (const x of [-width / 2 + 0.09 * u, width / 2 - 0.09 * u]) {
      mesh(roundedBox(0.18 * u, blockTop - baseY, 0.72 * u, 0.025 * u),
        casting, x, (blockTop + baseY) / 2, -0.36 * u)
      mesh(roundedBox(0.19 * u, blockTop - baseY, 0.025 * u, 0.008 * u),
        aluminium, x, (blockTop + baseY) / 2, 0.008 * u)
    }
    mesh(roundedBox(width, 0.25 * u, 0.3 * u, 0.04 * u),
      casting, 0, baseY + 0.2 * u, -0.48 * u)
    const headHeight = 0.42 * u
    mesh(
      roundedBox(width, headHeight, 0.62 * u, 0.08 * u),
      aluminium,
      0,
      head + 0.24 * u + headHeight / 2,
      -0.36 * u,
    )
    // Retain only the rear cover half so the front cam and springs stay visible.
    mesh(roundedBox(width * 0.98, 0.2 * u, 0.3 * u, 0.07 * u),
      darkMetal, 0, head + 0.94 * u, -0.53 * u)
    for (const z of [-0.61 * u, -0.49 * u])
      mesh(roundedBox(width * 0.88, 0.035 * u, 0.025 * u, 0.01 * u),
        aluminium, 0, head + 1.045 * u, z)
    for (let i = 0; i < 5; i++)
      mesh(new THREE.CylinderGeometry(0.038 * u, 0.038 * u, 0.04 * u, 6),
        steel, (i - 2) * spacing, head + 1.05 * u, -0.65 * u)
    mesh(new THREE.CylinderGeometry(0.13 * u, 0.13 * u, 0.08 * u, 24),
      darkMetal, -width * 0.32, head + 1.07 * u, -0.51 * u)
    mesh(roundedBox(0.19 * u, 0.035 * u, 0.045 * u, 0.01 * u),
      forged, -width * 0.32, head + 1.12 * u, -0.51 * u)
    // A stepped head casting and cover flange retain the open front valve view.
    mesh(roundedBox(width * 1.01, 0.075 * u, 0.78 * u, 0.025 * u),
      steel, 0, head + 0.27 * u, -0.35 * u)
    mesh(roundedBox(width, 0.065 * u, 0.76 * u, 0.025 * u),
      aluminium, 0, head + 0.67 * u, -0.35 * u)
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * spacing
      for (const z of [-0.25 * u, 0.25 * u]) {
        mesh(roundedBox(0.12 * u, 0.18 * u, 0.23 * u, 0.04 * u),
          aluminium, x, head + 0.85 * u, z)
        mesh(new THREE.CylinderGeometry(0.04 * u, 0.04 * u, 0.04 * u, 6),
          steel, x, head + 0.96 * u, z)
      }
    }
    // A cast sump and gasket line give the lower half a recognisable engine
    // silhouette instead of reading as a rectangular display plinth.
    mesh(
      roundedBox(width * 0.93, 0.38 * u, 1.25 * u, 0.09 * u),
      darkMetal,
      0,
      baseY - 0.14 * u,
      0,
    )
    mesh(
      roundedBox(width, 0.07 * u, 1.38 * u, 0.025 * u),
      aluminium,
      0,
      baseY + 0.05 * u,
      0,
    )
    // Casting ribs, core plugs and head fasteners are inexpensive geometry,
    // but add the scale cues missing from plain boxes.
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * spacing * 0.92
      mesh(
        roundedBox(0.055 * u, blockTop - baseY - 0.2 * u, 0.08 * u, 0.018 * u),
        forged,
        x,
        (blockTop + baseY) / 2,
        backZ + 0.1 * u,
      )
      mesh(
        new THREE.CylinderGeometry(0.075 * u, 0.075 * u, 0.035 * u, 20),
        forged,
        x,
        head + 0.22 * u,
        0.015 * u,
      ).rotation.x = Math.PI / 2
    }
    for (const z of [-0.25 * u, 0.25 * u]) {
      const cam = new THREE.Group()
      cam.position.set(0, head + 0.85 * u, z)
      scene.add(cam)
      cams.push(cam)
      const shaft = mesh(
        new THREE.CylinderGeometry(0.055 * u, 0.055 * u, width + 0.32 * u, 20),
        forged,
        0,
        0,
        0,
        cam,
      )
      shaft.rotation.z = Math.PI / 2
      for (let i = 0; i < 4; i++) {
        // Sample the same opening window as the valve animation. The profile
        // is an illustrative radial cam, not a manufactured cam design.
        const offset = engine.firingOrder.indexOf((i + 1) as 1 | 2 | 3 | 4) * 180
        // The build's low profile at zero phaser angle; phasing turns the
        // whole cam in the animation.
        const base = valveEvents(engine, false, 0, 0)
        const open = z < 0 ? base.intakeOpen : base.exhaustOpen
        const close = z < 0 ? base.intakeClose : base.exhaustClose
        const height = drawnLift(z < 0 ? base.intakeLift : base.exhaustLift)
        const profile = new THREE.Shape()
        for (let j = 0; j <= 128; j++) {
          const a = j / 128 * Math.PI * 2
          const phase = ((a * 360 / Math.PI - offset) % 720 + 720) % 720
          const lift = phase >= open && phase < close
            ? height * u * Math.sin(Math.PI * (phase - open) / (close - open)) : 0
          const radius = 0.12 * u + lift
          const px = -radius * Math.sin(a), py = -radius * Math.cos(a)
          if (j === 0) profile.moveTo(px, py)
          else profile.lineTo(px, py)
        }
        profile.closePath()
        const lobeGeometry = new THREE.ExtrudeGeometry(profile, {
          depth: 0.085 * u, bevelEnabled: true, bevelSize: 0.006 * u,
          bevelThickness: 0.006 * u, bevelSegments: 2, steps: 1,
        })
        lobeGeometry.translate(0, 0, -0.0425 * u)
        lobeGeometry.rotateY(Math.PI / 2)
        mesh(lobeGeometry, steel, (i - 1.5) * spacing, 0, 0, cam)
      }
    }
    // Open timing end: two equal cam wheels, crank wheel at half their radius.
    const timingX = -width / 2 - 0.16 * u
    const timingWheels = [
      { y: 0, z: 0, radius: 0.095 * u, ratio: 1 },
      { y: head + 0.85 * u, z: -0.25 * u, radius: 0.19 * u, ratio: 0.5 },
      { y: head + 0.85 * u, z: 0.25 * u, radius: 0.19 * u, ratio: 0.5 },
    ]
    for (const wheel of timingWheels) {
      const group = new THREE.Group()
      group.position.set(timingX, wheel.y, wheel.z)
      scene.add(group)
      timingPulleys.push({ group, ratio: wheel.ratio })
      const rim = mesh(new THREE.TorusGeometry(wheel.radius - 0.018 * u, 0.018 * u, 8, 40),
        steel, 0, 0, 0, group)
      rim.rotation.y = Math.PI / 2
      const hub = mesh(new THREE.CylinderGeometry(0.045 * u, 0.045 * u, 0.12 * u, 6),
        steel, 0, 0, 0, group)
      hub.rotation.z = Math.PI / 2
      const toothCount = wheel.ratio === 1 ? 24 : 48
      const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08 * u, 0.016 * u, 0.014 * u),
        forged, toothCount)
      const tooth = new THREE.Object3D()
      for (let j = 0; j < toothCount; j++) {
        const a = j * Math.PI * 2 / toothCount
        tooth.position.set(0, Math.cos(a) * (wheel.radius - 0.008 * u), Math.sin(a) * (wheel.radius - 0.008 * u))
        tooth.rotation.x = a
        tooth.updateMatrix()
        teeth.setMatrixAt(j, tooth.matrix)
      }
      teeth.castShadow = true
      teeth.receiveShadow = true
      group.add(teeth)
      meshes.push(teeth)
      for (let j = 0; j < 5; j++) {
        const a = j * Math.PI * 2 / 5
        const spoke = mesh(roundedBox(0.065 * u, wheel.radius * 0.75, 0.025 * u, 0.008 * u),
          forged, 0, Math.cos(a) * wheel.radius * 0.5, Math.sin(a) * wheel.radius * 0.5, group)
        spoke.rotation.x = a
      }
    }
    // Convex envelope of the wheels: sampled contact arcs joined by straight
    // tangent spans. A flat ribbon gives the belt real width, not a round hose.
    const beltPoints: THREE.Vector2[] = []
    for (let j = 0; j < 192; j++) {
      const a = j * Math.PI * 2 / 192
      const ny = Math.cos(a), nz = Math.sin(a)
      const wheel = timingWheels.reduce((best, w) =>
        w.y * ny + w.z * nz + w.radius > best.y * ny + best.z * nz + best.radius ? w : best)
      beltPoints.push(new THREE.Vector2(wheel.y + ny * (wheel.radius + 0.008 * u),
        wheel.z + nz * (wheel.radius + 0.008 * u)))
    }
    const beltVertices: number[] = []
    for (let j = 0; j < beltPoints.length; j++) {
      const a = beltPoints[j], b = beltPoints[(j + 1) % beltPoints.length]
      for (const [x, point] of [
        [-0.055 * u, a], [0.055 * u, a], [0.055 * u, b],
        [-0.055 * u, a], [0.055 * u, b], [-0.055 * u, b],
      ] as [number, THREE.Vector2][])
        beltVertices.push(timingX + x, point.x, point.y)
    }
    const beltGeometry = new THREE.BufferGeometry()
    beltGeometry.setAttribute('position', new THREE.Float32BufferAttribute(beltVertices, 3))
    beltGeometry.computeVertexNormals()
    mesh(beltGeometry, new THREE.MeshStandardMaterial({
      color: 0x17191a, roughness: 0.95, side: THREE.DoubleSide,
    }), 0, 0, 0)
    const crankNose = mesh(new THREE.CylinderGeometry(0.055 * u, 0.055 * u, 0.32 * u, 20),
      steel, -width / 2 - 0.08 * u, 0, 0)
    crankNose.rotation.z = Math.PI / 2
    // Main journals occupy only the gaps between throws. A continuous shaft
    // through each throw would intersect the rod as it swings through BDC.
    for (let i = 0; i < 5; i++) {
      const journal = mesh(new THREE.CylinderGeometry(0.14 * u, 0.14 * u,
        i === 0 || i === 4 ? 0.43 * u : spacing - 0.46 * u, 32),
        steel, (i - 2) * spacing, 0, 0)
      journal.rotation.z = Math.PI / 2
    }
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * spacing
      // Each piston glows with its own estimated crown temperature.
      const pistonMetal = aluminium.clone()
      pistonMetal.emissive.setHex(0xff3a10)
      pistonMetal.emissiveIntensity = 0
      const piston = mesh(
        new THREE.LatheGeometry([
          new THREE.Vector2(0, crown),
          new THREE.Vector2(0.43 * u, crown),
          new THREE.Vector2(0.475 * u, crown - 0.025 * u),
          new THREE.Vector2(0.475 * u, crown - 0.23 * u),
          new THREE.Vector2(0.40 * u, crown - 0.23 * u),
          new THREE.Vector2(0.40 * u, crown - 0.075 * u),
          new THREE.Vector2(0, crown - 0.075 * u),
        ].reverse(), 48),
        pistonMetal,
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
      // Two relieved skirt panels expose the wrist pin and rod small end.
      for (const start of [0.35, Math.PI + 0.35]) {
        const skirt = mesh(new THREE.CylinderGeometry(
          0.465 * u, 0.455 * u, 0.39 * u, 32, 1, true, start, Math.PI - 0.7,
        ), pistonMetal, 0, -0.115 * u, 0, piston)
        skirt.material.side = THREE.DoubleSide
      }
      const wrist = mesh(new THREE.CylinderGeometry(0.085 * u, 0.085 * u, 0.88 * u, 24),
        steel, 0, 0, 0, piston)
      wrist.rotation.z = Math.PI / 2
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
          new THREE.TorusGeometry(0.52 * u, 0.018 * u, 10, 48),
          steel,
          x,
          y,
          0,
        ).rotation.x = Math.PI / 2
      // Rigid I-section rod: its eyes and cap must not stretch during motion.
      const rod = new THREE.Group()
      scene.add(rod)
      rods.push(rod)
      const rodLength = engine.rodLength
      mesh(roundedBox(0.09 * u, rodLength - 0.33 * u, 0.16 * u, 0.02 * u),
        forged, 0, 0.035 * u, 0, rod)
      for (const z of [-0.095 * u, 0.095 * u])
        mesh(roundedBox(0.16 * u, rodLength - 0.33 * u, 0.045 * u, 0.015 * u),
          forged, 0, 0.035 * u, z, rod)
      for (const [y, radius, thickness] of [
        [-rodLength / 2, 0.215 * u, 0.055 * u],
        [rodLength / 2, 0.105 * u, 0.035 * u],
      ]) {
        const eye = mesh(new THREE.TorusGeometry(radius, thickness, 12, 32),
          forged, 0, y, 0, rod)
        eye.rotation.y = Math.PI / 2
      }
      mesh(roundedBox(0.19 * u, 0.09 * u, 0.44 * u, 0.025 * u),
        steel, 0, -rodLength / 2 - 0.24 * u, 0, rod)
      for (const z of [-0.19 * u, 0.19 * u])
        mesh(new THREE.CylinderGeometry(0.045 * u, 0.045 * u, 0.08 * u, 6),
          steel, 0, -rodLength / 2 - 0.30 * u, z, rod)
      const pin = mesh(
        new THREE.CylinderGeometry(0.15 * u, 0.15 * u, 0.32 * u, 24),
        steel,
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
          roundedBox(0.1 * u, r + 0.4 * u, 0.42 * u, 0.025 * u),
          steel,
          side * 0.21 * u,
          (r - 0.4 * u) / 2,
          0,
          throwGroup,
        )
      for (const side of [-1, 1]) {
      const weight = mesh(
        new THREE.CylinderGeometry(
          r * 0.55 + 0.3 * u,
          r * 0.55 + 0.3 * u,
          0.1 * u,
          32,
          1,
          false,
          Math.PI / 2,
          Math.PI,
        ),
        forged,
        side * 0.21 * u,
        -0.1 * u,
        0,
        throwGroup,
      )
      weight.rotation.z = Math.PI / 2
      }
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
      const springs: THREE.Mesh[] = []
      const pair = [-1, 1].map((v) => {
        const valve = mesh(
          new THREE.CylinderGeometry(0.17 * u, 0.12 * u, 0.05 * u, 24),
          steel,
          x,
          head + 0.16 * u,
          v * 0.25 * u,
        )
        mesh(
          new THREE.CylinderGeometry(0.03 * u, 0.03 * u, 0.52 * u, 12),
          steel,
          0,
          0.28 * u,
          0,
          valve,
        )
        // Retainer and bucket follower move rigidly with the valve stem.
        mesh(new THREE.CylinderGeometry(0.095 * u, 0.095 * u, 0.035 * u, 24),
          steel, 0, 0.5 * u, 0, valve)
        mesh(new THREE.CylinderGeometry(0.095 * u, 0.095 * u, 0.06 * u, 24),
          forged, 0, 0.54 * u, 0, valve)
        const springPoints: THREE.Vector3[] = []
        for (let j = 0; j <= 96; j++) {
          const t = j / 96, a = t * Math.PI * 12
          springPoints.push(new THREE.Vector3(0.065 * u * Math.cos(a), t * 0.36 * u, 0.065 * u * Math.sin(a)))
        }
        // Scale the helix axially as it compresses; its seat stays on the head.
        const spring = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints),
          96, 0.012 * u, 6, false), steel, x, head + 0.3 * u, v * 0.25 * u)
        spring.scale.y = 1
        springs.push(spring)
        mesh(new THREE.CylinderGeometry(0.1 * u, 0.1 * u, 0.025 * u, 24),
          aluminium, x, head + 0.3 * u, v * 0.25 * u)
        return valve
      })
      valves.push(pair)
      valveSprings.push(springs)
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
        forged,
        x + spacing / 2,
        0,
        0,
      )
      bearing.rotation.z = Math.PI / 2
    }
    for (const x of [-width / 2, width / 2]) {
      mesh(
        roundedBox(0.14 * u, r + 0.9 * u, 1.4 * u, 0.04 * u),
        standPaint,
        x,
        baseY + (r + 0.9 * u) / 2,
        0,
      )
      for (const z of [-0.6 * u, 0.6 * u])
        mesh(
          new THREE.CylinderGeometry(0.08 * u, 0.12 * u, baseY - groundY, 12),
          standPaint,
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
      steel,
      0,
      0,
      0,
      flywheel,
    ).rotation.y = Math.PI / 2
    // Timing mark makes rotation visible even at a glance.
    mesh(
      new THREE.BoxGeometry(0.18 * u, 0.3 * u, 0.08 * u),
      darkMetal,
      0,
      0.62 * u,
      0,
      flywheel,
    )
    // Shared attachment points keep the turbine and exhaust on one route.
    const exhaust = engine.exhaust
    const portY = head + 0.18 * u
    const frontZ = 1.26 * u
    const headerReach = Math.min(2.2, Math.max(0.5, exhaust.headerLength / 0.5)) * 0.28 * u
    const collector = new THREE.Vector3(width / 2 + 0.6 * u + headerReach,
      head - 0.85 * u, frontZ)
    const turboScale = engine.induction.kind === 'turbo'
      ? Math.max(0.6 * u, (engine.induction.compressorDiameter / 0.05) * 0.6 * u) : 0
    const turboPosition = new THREE.Vector3(collector.x + 0.65 * u + turboScale,
      collector.y - 0.7 * u, frontZ)
    const turbineInlet = turboPosition.clone().add(new THREE.Vector3(-0.55 * turboScale, 0.3 * turboScale, -0.5 * turboScale))
    const turbineOutlet = turboPosition.clone().add(new THREE.Vector3(0, 0, -1.05 * turboScale))
    // Supercharger accessories retain their drive at the timing end; the turbo
    // sits beyond the exhaust collector at the opposite end of the block.
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
      turbo.position.copy(turboPosition)
      scene.add(turbo)
      const scale = turboScale
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
      // Turbine outlet points rearwards; the shared exhaust route attaches here.
      mesh(new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, 0.55 * scale, 24, 1, true),
        hotHousing, 0, 0, -0.8 * scale, turbo).rotation.x = Math.PI / 2
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
    const intakeMetal = new THREE.MeshStandardMaterial({
      color: 0x69767c,
      metalness: 0.78,
      roughness: 0.5,
    })
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
    const plenumY = head + 1.0 * u
    const plenumZ = -1.0 * u
    let intakeConnection = new THREE.Vector3(width * 0.425, plenumY, plenumZ)
    if (fuelSystem.kind === 'direct')
      for (let i = 0; i < 4; i++)
        injector((i - 1.5) * spacing + 0.22 * u, head + 0.45 * u, 0, -0.35)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * spacing
      const runner = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, head + 0.2 * u, -0.38 * u),
        new THREE.Vector3(x, head + 0.52 * u, -0.72 * u),
        new THREE.Vector3(x, plenumY, plenumZ + 0.12 * u),
      ])
      mesh(
        new THREE.TubeGeometry(runner, 20, 0.13 * u, 14, false),
        intakeMetal,
        0,
        0,
        0,
      )
    }
    mesh(
      roundedBox(width * 0.85, 0.34 * u, 0.42 * u, 0.1 * u),
      intakeMetal,
      0,
      plenumY,
      plenumZ,
    ).castShadow = true
    if (fuelSystem.kind === 'port')
      for (let i = 0; i < 4; i++)
        injector((i - 1.5) * spacing, plenumY + 0.1 * u, -0.7 * u, 0.5)
    else if (fuelSystem.kind !== 'direct') {
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
      // Boosted carb/TBI builds use a sealed pressure hat at their air inlet.
      intakeConnection = new THREE.Vector3(filter, plenumY + 0.66 * u, plenumZ)
      mesh(
        new THREE.CylinderGeometry(filter, filter, 0.16 * u, 32),
        induction.kind === 'turbo' ? aluminium : paint,
        0,
        plenumY + 0.66 * u,
        plenumZ,
      ).castShadow = true
      if (fuelSystem.kind === 'throttleBody')
        injector(0, plenumY + 0.86 * u, plenumZ, 0)
    }
    if (fuelSystem.kind === 'port' || fuelSystem.kind === 'direct') {
      const body = mesh(new THREE.CylinderGeometry(0.2 * u, 0.2 * u, 0.26 * u, 24),
        aluminium, intakeConnection.x + 0.13 * u, intakeConnection.y, intakeConnection.z)
      body.rotation.z = Math.PI / 2
      mesh(roundedBox(0.16 * u, 0.18 * u, 0.16 * u, 0.03 * u),
        darkMetal, intakeConnection.x + 0.13 * u, intakeConnection.y + 0.18 * u, intakeConnection.z)
      intakeConnection.x += 0.26 * u
    }
    // Exhaust system on the +z side, drawn from the build's exhaust settings:
    // headers sized by length, a 4-1 or 4-2-1 merge, catalyst, silencer and
    // tailpipe. It glows with the header wall temperature and flashes on
    // afterfire; both come from telemetry.
    const hotPipe = new THREE.MeshStandardMaterial({
      color: 0x5d6263,
      metalness: 0.88,
      roughness: 0.42,
      emissive: 0xff4a12,
      emissiveIntensity: 0,
    })
    const weldMetal = new THREE.MeshStandardMaterial({
      color: 0x71645b, metalness: 0.9, roughness: 0.48,
    })
    const flash = new THREE.MeshStandardMaterial({
      color: 0xffb347,
      emissive: 0xff8a1f,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const innerFlash = new THREE.MeshBasicMaterial({
      color: 0xffe4a3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    })
    const pipeRadius = 0.082 * u
    const tube = (points: THREE.Vector3[], radius = pipeRadius, material: THREE.Material = hotPipe) => {
      // Rounded polyline stays within its routing corridor; unconstrained
      // Catmull-Rom curves overshoot long runs and cross neighbouring pipes.
      const curve = new THREE.CurvePath<THREE.Vector3>()
      let previous = points[0]
      for (let i = 1; i < points.length - 1; i++) {
        const corner = points[i]
        const bend = Math.min(0.18 * u,
          corner.distanceTo(points[i - 1]) * 0.3, corner.distanceTo(points[i + 1]) * 0.3)
        const entry = corner.clone().add(points[i - 1].clone().sub(corner).normalize().multiplyScalar(bend))
        const exit = corner.clone().add(points[i + 1].clone().sub(corner).normalize().multiplyScalar(bend))
        curve.add(new THREE.LineCurve3(previous, entry))
        curve.add(new THREE.QuadraticBezierCurve3(entry, corner, exit))
        previous = exit
      }
      curve.add(new THREE.LineCurve3(previous, points[points.length - 1]))
      mesh(new THREE.TubeGeometry(curve, 64, radius, 16), material, 0, 0, 0)
      // Weld collars follow the local pipe tangent instead of floating rings.
      for (const t of [0.06, 0.94]) {
        const point = curve.getPoint(t)
        const collar = mesh(new THREE.TorusGeometry(radius * 1.02, 0.009 * u, 6, 20),
          weldMetal, point.x, point.y, point.z)
        collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(t).normalize())
      }
    }
    if (induction.kind === 'turbo') {
      const hose = new THREE.MeshStandardMaterial({ color: 0x253945, roughness: 0.86 })
      const chargeRadius = 0.14 * u
      const chargeTube = (points: THREE.Vector3[]) => tube(points, chargeRadius, aluminium)
      const coupling = (point: THREE.Vector3, axis: THREE.Vector3) => {
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
        const sleeve = mesh(new THREE.CylinderGeometry(chargeRadius * 1.14, chargeRadius * 1.14,
          0.22 * u, 24, 1, true), hose, point.x, point.y, point.z)
        sleeve.quaternion.copy(rotation)
        for (const offset of [-0.075 * u, 0.075 * u]) {
          const centre = point.clone().addScaledVector(axis, offset)
          const clamp = mesh(new THREE.CylinderGeometry(chargeRadius * 1.18, chargeRadius * 1.18,
            0.025 * u, 24, 1, true), steel, centre.x, centre.y, centre.z)
          clamp.quaternion.copy(rotation)
        }
      }
      // Tangential compressor outlet rises clear of the cold housing before
      // turning around the outside of the engine to the intake side (-z).
      const outlet = turboPosition.clone().add(new THREE.Vector3(0.62 * turboScale, 0, 0.55 * turboScale))
      const outletTop = outlet.clone().add(new THREE.Vector3(0, 0.8 * turboScale + 0.35 * u, 0))
      const rearZ = -2.0 * u
      const rearCorner = new THREE.Vector3(outletTop.x, outletTop.y, rearZ)
      chargeTube([outlet, outletTop, rearCorner])
      coupling(outlet.clone().add(new THREE.Vector3(0, 0.32 * turboScale, 0)), new THREE.Vector3(0, 1, 0))
      const throttleApproach = intakeConnection.clone().add(new THREE.Vector3(0.45 * u, 0, 0))
      if (induction.intercooler.effectiveness > 0) {
        const coolerX = 0.1 * width, coolerY = head * 0.48
        mesh(roundedBox(2.0 * u, 0.85 * u, 0.3 * u, 0.035 * u),
          darkMetal, coolerX, coolerY, rearZ)
        // Fins are instanced: detail without one draw call per strip.
        const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.95 * u, 0.018 * u, 0.32 * u), aluminium, 22)
        const fin = new THREE.Object3D()
        for (let i = 0; i < 22; i++) {
          fin.position.set(coolerX, coolerY + (i - 10.5) * 0.037 * u, rearZ)
          fin.updateMatrix()
          fins.setMatrixAt(i, fin.matrix)
        }
        fins.castShadow = true
        fins.receiveShadow = true
        scene.add(fins)
        meshes.push(fins)
        for (const side of [-1, 1]) {
          mesh(roundedBox(0.28 * u, 0.92 * u, 0.4 * u, 0.08 * u),
            aluminium, coolerX + side * 1.1 * u, coolerY, rearZ)
          mesh(roundedBox(0.1 * u, 0.35 * u, 0.12 * u, 0.02 * u),
            standPaint, coolerX + side * 0.8 * u, coolerY - 0.6 * u, rearZ)
        }
        const inlet = new THREE.Vector3(coolerX + 1.24 * u, coolerY, rearZ)
        const cooled = new THREE.Vector3(coolerX - 1.24 * u, coolerY, rearZ)
        chargeTube([rearCorner, new THREE.Vector3(inlet.x + 0.5 * u, coolerY, rearZ), inlet])
        // Return behind and above the cooler, leaving its inlet route separate.
        chargeTube([cooled, cooled.clone().add(new THREE.Vector3(-0.4 * u, 0, 0)),
          new THREE.Vector3(cooled.x - 0.4 * u, plenumY + 0.7 * u, rearZ - 0.5 * u),
          new THREE.Vector3(throttleApproach.x, plenumY + 0.7 * u, rearZ - 0.5 * u),
          throttleApproach, intakeConnection])
        coupling(inlet.clone().add(new THREE.Vector3(0.16 * u, 0, 0)), new THREE.Vector3(1, 0, 0))
        coupling(cooled.clone().add(new THREE.Vector3(-0.16 * u, 0, 0)), new THREE.Vector3(1, 0, 0))
      } else {
        chargeTube([rearCorner,
          new THREE.Vector3(throttleApproach.x + 0.35 * u, throttleApproach.y, rearZ),
          throttleApproach, intakeConnection])
      }
      coupling(intakeConnection.clone().add(new THREE.Vector3(0.2 * u, 0, 0)), new THREE.Vector3(1, 0, 0))
    }
    // Sweep the individual primaries forward and down into a collector. This
    // keeps all four tubes readable instead of laying them across the cam cover.
    const ports = [0, 1, 2, 3].map(
      (i) => new THREE.Vector3((i - 1.5) * spacing, portY, 0.4 * u),
    )
    for (const port of ports) {
      mesh(roundedBox(0.4 * u, 0.29 * u, 0.065 * u, 0.045 * u),
        forged, port.x, port.y, port.z - 0.025 * u)
      for (const side of [-1, 1]) {
        const bolt = mesh(new THREE.CylinderGeometry(0.035 * u, 0.035 * u, 0.05 * u, 6),
          steel, port.x + side * 0.15 * u, port.y, port.z + 0.025 * u)
        bolt.rotation.x = Math.PI / 2
      }
    }
    // Each runner owns a separate depth lane. Leftmost ports take the
    // furthest lane so later port stubs never cross an earlier runner.
    const laneZ = (i: number) => frontZ + (1.5 - i) * 0.25 * u
    const primary = (i: number, end: THREE.Vector3) => tube([
      ports[i],
      new THREE.Vector3(ports[i].x, portY, laneZ(i)),
      new THREE.Vector3(collector.x - 0.35 * u, portY, laneZ(i)),
      new THREE.Vector3(collector.x, collector.y + 0.9 * u, laneZ(i)),
      end,
    ])
    if (exhaust.collector === '4-2-1') {
      for (const [a, b, side] of [[0, 3, -1], [1, 2, 1]]) {
        const merge = new THREE.Vector3(collector.x + side * 0.25 * u,
          collector.y + 0.42 * u, frontZ)
        primary(a, merge)
        primary(b, merge)
        tube([merge, new THREE.Vector3(merge.x, collector.y, frontZ)], pipeRadius * 1.3)
      }
    } else {
      for (let i = 0; i < 4; i++)
        primary(i, new THREE.Vector3(collector.x, collector.y, laneZ(i)))
    }
    const collectorCone = mesh(
      new THREE.CylinderGeometry(
        0.5 * u,
        pipeRadius * 1.3,
        0.55 * u,
        20,
      ),
      hotPipe,
      collector.x,
      collector.y - 0.275 * u,
      collector.z,
    )
    collectorCone.rotation.z = 0
    const clamp = mesh(new THREE.TorusGeometry(pipeRadius * 1.45, 0.025 * u, 8, 24),
      steel, collector.x, collector.y - 0.55 * u, collector.z)
    clamp.rotation.x = Math.PI / 2
    // Down past the flywheel, then back along the side: catalyst, silencer, tip.
    const runY = Math.max(groundY + 0.25 * u, baseY - 0.2 * u)
    const length = Math.min(
      2.2 * u * 3,
      Math.max(1.6 * u, (exhaust.tailpipeLength / 2.5) * 4.4 * u),
    )
    const turbocharged = induction.kind === 'turbo'
    const collectorExit = new THREE.Vector3(collector.x, collector.y - 0.55 * u, frontZ)
    if (turbocharged) tube([
      collectorExit,
      new THREE.Vector3(collector.x + 0.2 * u, collectorExit.y - 0.15 * u, frontZ),
      turbineInlet,
    ], pipeRadius * 1.3)
    const exhaustExit = turbocharged ? turbineOutlet : collectorExit
    const runX = exhaustExit.x
    const runStartZ = exhaustExit.z
    const endZ = runStartZ - length
    tube(
      [
        exhaustExit,
        new THREE.Vector3(runX, exhaustExit.y - 0.25 * u, runStartZ - 0.25 * u),
        new THREE.Vector3(runX, runY, runStartZ - 0.45 * u),
        new THREE.Vector3(runX, runY, endZ),
      ],
      pipeRadius * 1.3,
    )
    const along = (share: number) => runStartZ - 0.45 * u - share * (length - 0.45 * u)
    if (exhaust.catalyst)
      mesh(
        new THREE.CylinderGeometry(0.3 * u, 0.3 * u, 0.7 * u, 24),
        aluminium,
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
      new THREE.CylinderGeometry(pipeRadius * 1.6, pipeRadius * 1.3, 0.3 * u, 24, 1, true),
      steel,
      runX,
      runY,
      endZ,
    )
    tip.rotation.x = Math.PI / 2
    const tipInterior = mesh(new THREE.CircleGeometry(pipeRadius * 1.22, 24),
      darkMetal, runX, runY, endZ + 0.1 * u)
    tipInterior.rotation.y = Math.PI
    // Afterfire is a brief tapered flame, not a glowing ball. A few faint,
    // deterministic puffs make the normal exhaust legible without turning a
    // healthy petrol engine into a smoke machine.
    const fire = mesh(
      new THREE.ConeGeometry(0.16 * u, 0.62 * u, 18, 1, true),
      flash,
      runX,
      runY,
      endZ - 0.38 * u,
    )
    fire.rotation.x = -Math.PI / 2
    fire.castShadow = false
    const fireCore = mesh(
      new THREE.ConeGeometry(0.07 * u, 0.38 * u, 14, 1, true),
      innerFlash,
      runX,
      runY,
      endZ - 0.22 * u,
    )
    fireCore.rotation.x = -Math.PI / 2
    fireCore.castShadow = false
    const smokePuffs: {
      mesh: THREE.Mesh
      material: THREE.MeshBasicMaterial
      offset: number
    }[] = []
    for (let i = 0; i < 6; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x899398 : 0x727c81,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      })
      const puff = mesh(
        new THREE.IcosahedronGeometry(0.12 * u, 1),
        material,
        runX,
        runY,
        endZ - 0.18 * u,
      )
      puff.castShadow = false
      smokePuffs.push({ mesh: puff, material, offset: i / 6 })
    }
    scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3()
    // Gas volumes have unit-height geometry until the first animation frame;
    // exclude those overlays from physical framing bounds.
    for (const part of meshes)
      if (!chambers.includes(part)) bounds.expandByObject(part)
    const overviewCentre = bounds.getCenter(new THREE.Vector3())
    const overviewRadius = bounds.getSize(new THREE.Vector3()).length() / 2
    let fittedView: string | null = kept ? null : 'Overview'
    const fitCamera = (name: string) => {
      let target = overviewCentre.clone(), radius = overviewRadius
      let direction = new THREE.Vector3(0.65, 0.4, 1)
      if (name === 'Timing') {
        target = new THREE.Vector3(timingX, (head + 0.85 * u) / 2, 0)
        radius = (head + 1.3 * u) * 0.55
        direction = new THREE.Vector3(-1, 0.15, 0.3)
      } else if (name === 'Crank') {
        target = new THREE.Vector3(0, 0.15 * u, 0)
        radius = Math.hypot(width / 2, r + 0.45 * u)
        direction = new THREE.Vector3(0.18, 0.12, 1)
      } else if (name === 'Turbo' && induction.kind === 'turbo') {
        target = turboPosition.clone()
        radius = Math.max(1.7 * turboScale, 1.2 * u)
        direction = new THREE.Vector3(0.5, 0.3, 1)
      }
      const vertical = THREE.MathUtils.degToRad(camera.fov)
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect)
      const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.08
      controls.maxDistance = Math.max(1.6 * size, distance * 2)
      controls.minDistance = Math.min(0.35 * size, distance * 0.45)
      camera.far = Math.max(10 * size, distance * 4)
      camera.position.copy(target).addScaledVector(direction.normalize(), distance)
      controls.target.copy(target)
      camera.updateProjectionMatrix()
      controls.update()
    }
    cameraPreset.current = (name) => { fittedView = name; fitCamera(name) }
    const leavePreset = () => { fittedView = null }
    controls.addEventListener('start', leavePreset)
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.18 * Math.max(size, 1), 64),
      new THREE.ShadowMaterial({ transparent: true, opacity: 0.28 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = groundY + 0.001 * size
    floor.receiveShadow = true
    scene.add(floor)
    meshes.push(floor)
    const grid = new THREE.GridHelper(1.6, 32, 0x315260, 0x202e34)
    grid.scale.setScalar(Math.max(size, 1))
    grid.position.y = groundY
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material]
    for (const material of gridMaterials) {
      material.transparent = true
      material.opacity = 0.42
    }
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
        .intersectObjects([...pistons, ...chambers], false)
        .find((h) => typeof h.object.userData.cylinder === 'number')
      if (hit) options.current.onSelect(hit.object.userData.cylinder)
    }
    renderer.domElement.addEventListener('pointerup', click)
    const resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        // Keep the cylinder controls outside the rendered scene at every zoom.
        h = Math.max(1, host.clientHeight - 112)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      if (fittedView) fitCamera(fittedView)
    })
    resize.observe(host)
    let frame = 0,
      last = performance.now(),
      inspectionAngle = 0,
      lastSample = -1,
      receivedAt = performance.now()
    const up = new THREE.Vector3(0, 1, 0)
    const frameEvents = emptyEvents()
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const now = performance.now(),
        dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = telemetry.current
      const intakePhase = t?.ecu.camPhase?.intake ?? 0
      const exhaustPhase = t?.ecu.camPhase?.exhaust ?? 0
      const events = valveEvents(
        engine,
        t?.ecu.cam === 'high',
        intakePhase,
        exhaustPhase,
        frameEvents,
      )
      const floatRatio =
        t?.stress.limits.find((limit) => limit.key === 'valveFloat')?.ratio ?? 0
      const floating = options.current.slow ? 0 : floatSeverity(floatRatio)
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
        // A knocking cylinder's chamber flashes white through the power stroke.
        const knocking =
          !!t && !options.current.slow && t.knock.intensity[i] > 0 && degrees < 90
        if (knocking) material.emissive.setHex(0xffffff)
        material.emissiveIntensity =
          (options.current.selected === i ? 1.4 : 0.5) +
          (options.current.overlays && degrees < 65 ? 1.2 : 0) +
          (knocking ? 2 : 0)
        // Visible from about 250 °C, bright by 380 °C.
        ;(pistons[i].material as THREE.MeshStandardMaterial).emissiveIntensity =
          t ? Math.min(1.2, Math.max(0, (t.temperatures.crown[i] - 523) / 110)) : 0
        // Spark flashes from ignition until early in the power stroke, at the
        // timing the ECU is using (map and knock retard included).
        const advance = t
          ? t.ecu.advance - t.knock.retard[i]
          : engine.ignitionAdvance
        const sinceSpark = wrap(phase + (advance * Math.PI) / 180)
        sparks[i].emissiveIntensity =
          sinceSpark < (advance + 25) * (Math.PI / 180) ? 6 : 0
        const height = Math.max(0.02 * u, head - y - crown)
        chambers[i].scale.y = height
        chambers[i].position.y = y + crown + height / 2
        // The same events as the physics, including phasing and VTEC.
        valves[i][0].position.y =
          head +
          0.16 * u -
          u *
            floatedLiftAt(
              events.intakeOpen,
              events.intakeClose,
              drawnLift(events.intakeLift),
              degrees,
              events.motion,
              floating,
            )
        valves[i][1].position.y =
          head +
          0.16 * u -
          u *
            floatedLiftAt(
              events.exhaustOpen,
              events.exhaustClose,
              drawnLift(events.exhaustLift),
              degrees,
              events.motion,
              floating,
            )
      }
      for (let i = 0; i < 4; i++)
        for (let v = 0; v < 2; v++)
          valveSprings[i][v].scale.y = (valves[i][v].position.y + 0.5 * u - (head + 0.3 * u)) / (0.36 * u)
      for (const pulley of timingPulleys) pulley.group.rotation.x = angle * pulley.ratio
      flywheel.rotation.x = angle
      // Phasers turn each cam ahead of the crank (half crank degrees).
      cams.forEach((cam, k) => {
        const advance = k === 0 ? intakePhase : exhaustPhase
        cam.rotation.x = angle * 0.5 + (advance * Math.PI) / 360
      })
      if (t) {
        // Visible from about 400 °C, bright by 800 °C.
        hotPipe.emissiveIntensity = Math.min(
          0.72,
          Math.max(0, (t.exhaustWall - 723) / 430),
        )
        const pop = t.afterfire && !options.current.slow ? 1 : 0
        const flameResponse = Math.min(1, dt * 22)
        flash.opacity += (pop * 0.72 - flash.opacity) * flameResponse
        innerFlash.opacity +=
          (pop * 0.82 - innerFlash.opacity) * flameResponse
        flash.emissiveIntensity = flash.opacity * 3.5
        fire.scale.set(0.85 + flash.opacity * 0.25, 0.7 + flash.opacity, 0.85)
        fireCore.scale.set(
          0.8 + innerFlash.opacity * 0.2,
          0.65 + innerFlash.opacity * 0.8,
          0.8,
        )
        const smokeStrength = options.current.slow
          ? 0
          : t.rpm > 150
            ? 0.035 + t.throttle * 0.035 + pop * 0.08
            : 0
        for (const puff of smokePuffs) {
          const progress = (t.time * (0.42 + t.rpm / 28000) + puff.offset) % 1
          puff.mesh.position.set(
            runX + Math.sin((progress + puff.offset) * Math.PI * 2) * 0.07 * u,
            runY + progress * 0.28 * u,
            endZ - (0.16 + progress * 1.35) * u,
          )
          const puffScale = 0.55 + progress * 1.25
          puff.mesh.scale.set(puffScale, puffScale * 0.78, puffScale * 1.35)
          puff.material.opacity =
            smokeStrength * Math.sin(Math.PI * progress) * (1 - progress * 0.45)
        }
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
      cameraPreset.current = null
      controls.removeEventListener('start', leavePreset)
      controls.dispose()
      renderer.domElement.removeEventListener('pointerup', click)
      for (const m of meshes) {
        m.geometry.dispose()
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        for (const mat of mats) mat.dispose()
      }
      grid.geometry.dispose()
      castingGrain.dispose()
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
      <div className="camera-presets" role="group" aria-label="Engine camera views">
        {['Overview', 'Timing', 'Crank', ...(engine.induction.kind === 'turbo' ? ['Turbo'] : [])].map((name) => (
          <button key={name} type="button" disabled={failed}
            onClick={() => cameraPreset.current?.(name)} aria-label={`${name} camera view`}>
            {name}
          </button>
        ))}
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
