/**
 * Quasi-one-dimensional compressible flow in an exhaust pipe of varying
 * cross-section: finite volumes, MUSCL-Hancock reconstruction with a
 * minmod limiter and the HLLC Riemann flux (Toro, Riemann Solvers and
 * Numerical Methods for Fluid Dynamics, 3rd ed., §10.4 and §14.4). Gas
 * properties match the cylinder model (cv rising with temperature), so
 * mass and energy pass between them unchanged. The port end takes a
 * prescribed flow from the cylinder; the outlet is open to the
 * atmosphere. Fresh charge and fuel are carried as passive scalars, so
 * short-circuited charge pushed back by a returning wave is accounted for.
 * Allocation-free after construction, for the 48 kHz AudioWorklet.
 */
import {
  CV_A,
  CV_B,
  internalEnergy,
  R,
  temperatureFromEnergy,
} from './physics'

/**
 * Target cell length, m. With second-order reconstruction, 3 cm cells
 * resolve the waves that tune a pipe (wavelengths over a metre).
 */
export const CELL = 0.03
/** Courant number for the explicit update. */
const COURANT = 0.8
/** Fanning friction factor of the pipe wall. */
const FRICTION = 0.004
/** Gas-to-wall heat transfer coefficient, W/m²K, and wall temperature, K. */
const WALL_HEAT = 120
export const PIPE_WALL = 600

export type PipeSegment = { length: number; start: number; end: number }

const gamma = (t: number) => 1 + R / (CV_A + CV_B * t)
const INV_R = 1 / R

export class Pipe {
  readonly cells: number
  readonly dx: number
  readonly length: number
  /** Cross-section at cell centres and faces, m². */
  readonly area: Float64Array
  readonly faceArea: Float64Array
  /** Diameter at cell centres, m. */
  readonly diameter: Float64Array
  /** 1 / area and wall perimeter per cell. */
  private inverseArea: Float64Array
  private perimeter: Float64Array
  /** Conserved per cell, per unit length: ρA, ρuA, EA, ρY_fresh·A, ρY_fuel·A. */
  private q0: Float64Array
  private q1: Float64Array
  private q2: Float64Array
  private q3: Float64Array
  private q4: Float64Array
  /** Primitive state: density, velocity, pressure, temperature, scalars. */
  private rho: Float64Array
  private u: Float64Array
  private p: Float64Array
  private t: Float64Array
  private yf: Float64Array
  private yb: Float64Array
  /** Sound speed per cell, m/s, and the fastest wave, m/s. */
  private c: Float64Array
  /** γ − 1 per cell, for the predictor. */
  private g1: Float64Array
  private fastest = 1
  /**
   * Face states after reconstruction and the half-step: at face f, the
   * left state comes from cell f − 1 and the right from cell f.
   */
  private lr: Float64Array
  private lu: Float64Array
  private lp: Float64Array
  private lf: Float64Array
  private lb: Float64Array
  private rr: Float64Array
  private ru: Float64Array
  private rp: Float64Array
  private rf: Float64Array
  private rb: Float64Array
  /** Face fluxes. */
  private f0: Float64Array
  private f1: Float64Array
  private f2: Float64Array
  private f3: Float64Array
  private f4: Float64Array
  /** Well-balanced integral of p dA in each cell's momentum equation. */
  private areaSource: Float64Array
  /** Allocation-free result of stationaryMap. */
  private mappedRho = 0
  private mappedU = 0
  private mappedP = 0
  private ambientPressure: number
  private ambientDensity: number
  private readonly wellBalanced: boolean
  /** Mass flow leaving the outlet over the last advance, kg/s (sound source). */
  outletFlow = 0
  /** Totals passed through each end since construction, for balance checks. */
  portMass = 0
  portEnergy = 0
  outletMass = 0
  outletEnergy = 0
  heatLost = 0
  /** Largest number of solver steps one advance needed. */
  maxSteps = 0

  constructor(
    segments: PipeSegment[],
    ambientPressure: number,
    ambientTemperature: number,
    startTemperature = ambientTemperature,
    wellBalanced = true,
    cellLength = CELL,
  ) {
    this.wellBalanced = wellBalanced
    const length = segments.reduce((s, g) => s + g.length, 0)
    this.length = length
    const n = Math.max(4, Math.round(length / cellLength))
    this.cells = n
    this.dx = length / n
    this.area = new Float64Array(n)
    this.diameter = new Float64Array(n)
    this.faceArea = new Float64Array(n + 1)
    const diameterAt = (x: number) => {
      let s = 0
      for (const g of segments) {
        if (x <= s + g.length || g === segments[segments.length - 1]) {
          const k = Math.min(1, Math.max(0, (x - s) / g.length))
          return g.start + (g.end - g.start) * k
        }
        s += g.length
      }
      return segments[segments.length - 1].end
    }
    const areaOf = (d: number) => (Math.PI * d * d) / 4
    for (let i = 0; i <= n; i++) {
      // A face at a step between segments takes the narrower side.
      const x = i * this.dx
      const a = diameterAt(Math.max(0, x - 1e-9))
      const b = diameterAt(Math.min(length, x + 1e-9))
      this.faceArea[i] = areaOf(Math.min(a, b))
    }
    this.inverseArea = new Float64Array(n)
    this.perimeter = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      this.diameter[i] = diameterAt((i + 0.5) * this.dx)
      this.area[i] = areaOf(this.diameter[i])
      this.inverseArea[i] = 1 / this.area[i]
      this.perimeter[i] = Math.PI * this.diameter[i]
    }
    const make = () => new Float64Array(n)
    this.q0 = make()
    this.q1 = make()
    this.q2 = make()
    this.q3 = make()
    this.q4 = make()
    this.rho = make()
    this.u = make()
    this.p = make()
    this.t = make()
    this.yf = make()
    this.yb = make()
    this.c = make()
    this.g1 = make()
    const faces = () => new Float64Array(n + 1)
    this.lr = faces()
    this.lu = faces()
    this.lp = faces()
    this.lf = faces()
    this.lb = faces()
    this.rr = faces()
    this.ru = faces()
    this.rp = faces()
    this.rf = faces()
    this.rb = faces()
    this.f0 = new Float64Array(n + 1)
    this.f1 = new Float64Array(n + 1)
    this.f2 = new Float64Array(n + 1)
    this.f3 = new Float64Array(n + 1)
    this.f4 = new Float64Array(n + 1)
    this.areaSource = make()
    this.ambientPressure = ambientPressure
    this.ambientDensity = ambientPressure / (R * ambientTemperature)
    const density = ambientPressure / (R * startTemperature)
    for (let i = 0; i < n; i++) {
      const a = this.area[i]
      this.q0[i] = density * a
      this.q1[i] = 0
      this.q2[i] = density * internalEnergy(startTemperature) * a
    }
    this.primitives()
  }

  /** Pressure, temperature and composition at the port end. */
  get portPressure() {
    return this.p[0]
  }
  get portTemperature() {
    return this.t[0]
  }
  get portDensity() {
    return this.rho[0]
  }
  get portFresh() {
    return this.yf[0]
  }
  get portFuel() {
    return this.yb[0]
  }
  /** Stagnation enthalpy of gas at the port end, J/kg. */
  get portEnthalpy() {
    const u = this.u[0]
    return internalEnergy(this.t[0]) + R * this.t[0] + 0.5 * u * u
  }
  pressureAt(i: number) {
    return this.p[i]
  }
  temperatureAt(i: number) {
    return this.t[i]
  }
  velocityAt(i: number) {
    return this.u[i]
  }
  /** Gas mass and energy held in the pipe, kg and J. */
  totals() {
    let mass = 0
    let energy = 0
    for (let i = 0; i < this.cells; i++) {
      mass += this.q0[i] * this.dx
      energy += this.q2[i] * this.dx
    }
    return { mass, energy }
  }

  /**
   * Advance by dt with the port's flows held over it: mass (kg/s, negative
   * when drawn back into the cylinder), energy (W), fresh charge and fuel
   * (kg/s). The cylinder computes them, so what it loses the pipe gains
   * exactly. Substeps as the Courant limit requires.
   */
  advance(
    dt: number,
    flow: number,
    energy: number,
    fresh: number,
    fuel: number,
  ) {
    let left = dt
    let steps = 0
    let outlet = 0
    while (left > 1e-12) {
      const h = Math.min(left, (COURANT * this.dx) / this.fastest)
      outlet += this.step(h, flow, energy, fresh, fuel) * h
      left -= h
      steps++
      if (steps > 64)
        throw new Error('Exhaust pipe flow left the supported model range.')
    }
    this.outletFlow = outlet / dt
    if (steps > this.maxSteps) this.maxSteps = steps
  }

  private primitives() {
    const { q0, q1, q2, q3, q4, rho, u, p, t, yf, yb, c, g1, inverseArea } = this
    let fastest = 1
    for (let i = 0; i < this.cells; i++) {
      const density = q0[i] * inverseArea[i]
      const inverse = 1 / q0[i]
      const v = q1[i] * inverse
      const temperature = temperatureFromEnergy(q2[i] * inverse - 0.5 * v * v)
      if (!(density > 0) || !(temperature > 30) || !(temperature < 6000))
        throw new Error('Exhaust pipe flow left the supported model range.')
      rho[i] = density
      u[i] = v
      t[i] = temperature
      p[i] = density * R * temperature
      yf[i] = Math.min(1, Math.max(0, q3[i] * inverse))
      yb[i] = Math.max(0, q4[i] * inverse)
      const g = gamma(temperature)
      g1[i] = g - 1
      const sound = Math.sqrt(g * R * temperature)
      c[i] = sound
      const speed = Math.abs(v) + sound
      if (speed > fastest) fastest = speed
    }
    this.fastest = fastest
  }
  private step(
    dt: number,
    flow: number,
    energy: number,
    fresh: number,
    fuel: number,
  ) {
    const n = this.cells
    const k = dt / (2 * this.dx)
    const { rho, u, p, yf, yb } = this
    // MUSCL reconstruction (minmod slopes of ρ, u, p and the scalars) and
    // the Hancock half-step: each cell's two face states are evolved by
    // the difference of their own fluxes. Edge cells stay first order.
    for (let i = 0; i < n; i++) {
      let sr = 0,
        su = 0,
        sp = 0,
        sf = 0,
        sb = 0
      if (i > 0 && i < n - 1) {
        sr = minmod(rho[i] - rho[i - 1], rho[i + 1] - rho[i])
        su = minmod(u[i] - u[i - 1], u[i + 1] - u[i])
        sp = minmod(p[i] - p[i - 1], p[i + 1] - p[i])
        sf = minmod(yf[i] - yf[i - 1], yf[i + 1] - yf[i])
        sb = minmod(yb[i] - yb[i - 1], yb[i + 1] - yb[i])
      }
      const r1 = rho[i] - 0.5 * sr,
        u1 = u[i] - 0.5 * su,
        p1 = p[i] - 0.5 * sp
      const r2 = rho[i] + 0.5 * sr,
        u2 = u[i] + 0.5 * su,
        p2 = p[i] + 0.5 * sp
      const f1 = yf[i] - 0.5 * sf,
        f2 = yf[i] + 0.5 * sf
      const b1 = yb[i] - 0.5 * sb,
        b2 = yb[i] + 0.5 * sb
      const e1 = r1 * (internalEnergy((p1 * INV_R) / r1) + 0.5 * u1 * u1)
      const e2 = r2 * (internalEnergy((p2 * INV_R) / r2) + 0.5 * u2 * u2)
      const m1 = r1 * u1
      const m2 = r2 * u2
      const d0 = k * (m1 - m2)
      const d1 = k * (m1 * u1 + p1 - m2 * u2 - p2)
      const d2 = k * (u1 * (e1 + p1) - u2 * (e2 + p2))
      const d3 = k * (m1 * f1 - m2 * f2)
      const d4 = k * (m1 * b1 - m2 * b2)
      // Left state of cell i is the right state at face i, and so on.
      // The predictor's pressure uses the cell's own γ over the small
      // half-step change (p = (γ − 1)·Δe added to the state's pressure).
      const g1 = this.g1[i]
      let rl = r1 + d0
      const il = 1 / rl
      let ul = (m1 + d1) * il
      let pl = p1 + g1 * (d2 - 0.5 * (ul * (m1 + d1) - u1 * m1))
      if (!(rl > 0) || !(pl > 0)) {
        rl = rho[i]
        ul = u[i]
        pl = p[i]
        this.rf[i] = yf[i]
        this.rb[i] = yb[i]
      } else {
        this.rf[i] = (r1 * f1 + d3) * il
        this.rb[i] = (r1 * b1 + d4) * il
      }
      this.rr[i] = rl
      this.ru[i] = ul
      this.rp[i] = pl
      let rr = r2 + d0
      const ir = 1 / rr
      let ur = (m2 + d1) * ir
      let pr = p2 + g1 * (d2 - 0.5 * (ur * (m2 + d1) - u2 * m2))
      if (!(rr > 0) || !(pr > 0)) {
        rr = rho[i]
        ur = u[i]
        pr = p[i]
        this.lf[i + 1] = yf[i]
        this.lb[i + 1] = yb[i]
      } else {
        this.lf[i + 1] = (r2 * f2 + d3) * ir
        this.lb[i + 1] = (r2 * b2 + d4) * ir
      }
      this.lr[i + 1] = rr
      this.lu[i + 1] = ur
      this.lp[i + 1] = pr
    }
    /*
     * At a varying-area face, reconstruct each neighbouring cell along its
     * local stationary isentropic nozzle solution. Ordinary HLLC states do
     * not contain area, so without this step a pressure wave barely sees a
     * sharp expansion. Using the same stationary states for the p dA source
     * makes a steady subsonic flow an exact discrete equilibrium instead of
     * feeding a spurious cone oscillation.
     */
    if (this.wellBalanced) {
      for (let i = 0; i < n; i++) {
        const a = this.area[i]
        const leftArea = this.faceArea[i]
        const rightArea = this.faceArea[i + 1]
        this.stationaryMap(rho[i], u[i], p[i], a, leftArea)
        const leftMomentum =
          (this.mappedRho * this.mappedU * this.mappedU + this.mappedP) *
          leftArea
        if (Math.abs(leftArea - a) > 1e-14) {
          this.rr[i] = this.mappedRho
          this.ru[i] = this.mappedU
          this.rp[i] = this.mappedP
          this.rf[i] = yf[i]
          this.rb[i] = yb[i]
        }
        this.stationaryMap(rho[i], u[i], p[i], a, rightArea)
        const rightMomentum =
          (this.mappedRho * this.mappedU * this.mappedU + this.mappedP) *
          rightArea
        if (Math.abs(rightArea - a) > 1e-14) {
          this.lr[i + 1] = this.mappedRho
          this.lu[i + 1] = this.mappedU
          this.lp[i + 1] = this.mappedP
          this.lf[i + 1] = yf[i]
          this.lb[i + 1] = yb[i]
        }
        this.areaSource[i] = rightMomentum - leftMomentum
      }
    } else {
      // Schema 4 and older two-strokes retain the original source term and
      // unreconstructed faces so their recorded model remains reproducible.
      for (let i = 0; i < n; i++)
        this.areaSource[i] = p[i] * (this.faceArea[i + 1] - this.faceArea[i])
    }
    this.hllc(1, n - 1)
    // Port face: the cylinder's flow and its momentum flux, ṁu = ṁ²/ρA,
    // which is positive both ways (backflow carries negative momentum out).
    const a0 = this.faceArea[0]
    this.f0[0] = flow
    this.f1[0] = p[0] * a0 + (flow * flow) / (rho[0] * a0)
    this.f2[0] = energy
    this.f3[0] = fresh
    this.f4[0] = fuel
    // Open outlet: subsonic outflow sees ambient pressure; inflow draws
    // ambient air (neither fresh charge nor fuel). The ghost cell is the
    // right state of the last face.
    const outU = this.lu[n]
    if (outU >= this.c[n - 1]) {
      this.rr[n] = this.lr[n]
      this.rp[n] = this.lp[n]
    } else if (outU >= 0) {
      this.rr[n] = this.lr[n] * (this.ambientPressure / this.lp[n])
      this.rp[n] = this.ambientPressure
    } else {
      this.rr[n] = this.ambientDensity
      this.rp[n] = this.ambientPressure
    }
    this.ru[n] = outU
    this.rf[n] = outU >= 0 ? this.lf[n] : 0
    this.rb[n] = outU >= 0 ? this.lb[n] : 0
    this.hllc(n, n)
    // Conservative update with the area-change pressure source, wall
    // friction and heat loss.
    const r = dt / this.dx
    let heat = 0
    for (let i = 0; i < n; i++) {
      const wall = this.perimeter[i] * dt
      const v = u[i]
      this.q0[i] -= r * (this.f0[i + 1] - this.f0[i])
      this.q1[i] -=
        r * (this.f1[i + 1] - this.f1[i]) -
        r * this.areaSource[i] +
        0.5 * FRICTION * rho[i] * v * Math.abs(v) * wall
      const loss = WALL_HEAT * (this.t[i] - PIPE_WALL) * wall
      this.q2[i] -= r * (this.f2[i + 1] - this.f2[i]) + loss
      heat += loss * this.dx
      this.q3[i] -= r * (this.f3[i + 1] - this.f3[i])
      this.q4[i] -= r * (this.f4[i + 1] - this.f4[i])
    }
    this.portMass += this.f0[0] * dt
    this.portEnergy += this.f2[0] * dt
    this.outletMass += this.f0[n] * dt
    this.outletEnergy += this.f2[n] * dt
    this.heatLost += heat
    this.primitives()
    return this.f0[n]
  }

  /**
   * Map a primitive state from one area to another on the same isentropic
   * stationary nozzle branch. This is the exact calorically-perfect-gas
   * area–Mach relation using the cell's local gamma; the main gas model may
   * still vary cv with temperature. If the requested throat would choke the
   * state, it is bounded at Mach 1.
   */
  private stationaryMap(
    density: number,
    velocity: number,
    pressure: number,
    fromArea: number,
    toArea: number,
  ) {
    if (Math.abs(toArea - fromArea) <= 1e-14 || Math.abs(velocity) < 1e-9) {
      this.mappedRho = density
      this.mappedU = velocity
      this.mappedP = pressure
      return
    }
    const temperature = pressure / (density * R)
    const g = gamma(temperature)
    const a = 0.5 * (g - 1)
    const exponent = (g + 1) / (2 * (g - 1))
    const sound = Math.sqrt(g * R * temperature)
    const mach = Math.min(20, Math.abs(velocity) / sound)
    const logAreaMach = (m: number) =>
      exponent * Math.log((2 * (1 + a * m * m)) / (g + 1)) - Math.log(m)
    const logTarget = Math.max(0, Math.log(toArea / fromArea) + logAreaMach(mach))
    let lo: number
    let hi: number
    let mappedMach: number
    if (mach <= 1) {
      lo = 1e-9
      hi = 1
      mappedMach = Math.min(1, Math.max(lo, mach * fromArea / toArea))
    } else {
      lo = 1
      hi = Math.max(2, mach)
      while (logAreaMach(hi) < logTarget && hi < 20) hi *= 2
      hi = Math.min(20, hi)
      mappedMach = Math.min(hi, Math.max(lo, mach))
    }
    // Safeguarded Newton iteration on log(A/A*). The derivative is
    // analytic. Smooth cone cells need one iteration; the steeper area
    // changes that materially reflect a wave take a second. This replaces
    // the old 36-step bisection while retaining a deterministic branch.
    const iterations = Math.max(toArea / fromArea, fromArea / toArea) > 1.12 ? 2 : 1
    for (let k = 0; k < iterations; k++) {
      const m2 = mappedMach * mappedMach
      const residual = logAreaMach(mappedMach) - logTarget
      if (mach <= 1) {
        if (residual > 0) lo = mappedMach
        else hi = mappedMach
      } else if (residual < 0) lo = mappedMach
      else hi = mappedMach
      const derivative = ((g + 1) * mappedMach) / (2 * (1 + a * m2)) - 1 / mappedMach
      const next = mappedMach - residual / derivative
      mappedMach = next > lo && next < hi && Number.isFinite(next) ? next : (lo + hi) / 2
    }
    const stagnationTerm = 1 + a * mach * mach
    const mappedTerm = 1 + a * mappedMach * mappedMach
    const mappedTemperature = (temperature * stagnationTerm) / mappedTerm
    const mappedPressure =
      pressure * (stagnationTerm / mappedTerm) ** (g / (g - 1))
    this.mappedRho = mappedPressure / (R * mappedTemperature)
    this.mappedU =
      Math.sign(velocity) *
      mappedMach *
      Math.sqrt(g * R * mappedTemperature)
    this.mappedP = mappedPressure
  }
  /**
   * HLLC fluxes through faces first to last (Davis wave-speed estimates
   * from the neighbouring cells' sound speeds; the outlet ghost shares the
   * last cell's), times the face area: mass, momentum, energy and the two
   * scalars.
   */
  private hllc(first: number, last: number) {
    const { lr, lu, lp, lf, lb, rr, ru, rp, rf, rb, c, faceArea } = this
    const { f0, f1, f2, f3, f4 } = this
    const cells = this.cells
    for (let f = first; f <= last; f++) {
      const dl = lr[f],
        ul = lu[f],
        pl = lp[f]
      const dr = rr[f],
        ur = ru[f],
        pr = rp[f]
      const tl = (pl * INV_R) / dl
      const tr = (pr * INV_R) / dr
      const al = c[f - 1]
      const ar = c[f < cells ? f : f - 1]
      const el = dl * (tl * (CV_A + 0.5 * CV_B * tl) + 0.5 * ul * ul)
      const er = dr * (tr * (CV_A + 0.5 * CV_B * tr) + 0.5 * ur * ur)
      const sl = Math.min(ul - al, ur - ar)
      const sr = Math.max(ul + al, ur + ar)
      let m0: number, m1: number, m2: number, m3: number, m4: number
      if (sl >= 0) {
        const m = dl * ul
        m0 = m
        m1 = m * ul + pl
        m2 = ul * (el + pl)
        m3 = m * lf[f]
        m4 = m * lb[f]
      } else if (sr <= 0) {
        const m = dr * ur
        m0 = m
        m1 = m * ur + pr
        m2 = ur * (er + pr)
        m3 = m * rf[f]
        m4 = m * rb[f]
      } else {
        const ml = dl * (sl - ul)
        const mr = dr * (sr - ur)
        const star = (pr - pl + ml * ul - mr * ur) / (ml - mr)
        if (star >= 0) {
          const m = dl * ul
          const k = ml / (sl - star)
          const es = k * (el / dl + (star - ul) * (star + pl / ml))
          m0 = m + sl * (k - dl)
          m1 = m * ul + pl + sl * (k * star - m)
          m2 = ul * (el + pl) + sl * (es - el)
          m3 = m0 * lf[f]
          m4 = m0 * lb[f]
        } else {
          const m = dr * ur
          const k = mr / (sr - star)
          const es = k * (er / dr + (star - ur) * (star + pr / mr))
          m0 = m + sr * (k - dr)
          m1 = m * ur + pr + sr * (k * star - m)
          m2 = ur * (er + pr) + sr * (es - er)
          m3 = m0 * rf[f]
          m4 = m0 * rb[f]
        }
      }
      const a = faceArea[f]
      f0[f] = m0 * a
      f1[f] = m1 * a
      f2[f] = m2 * a
      f3[f] = m3 * a
      f4[f] = m4 * a
    }
  }
}

function minmod(a: number, b: number) {
  if (a * b <= 0) return 0
  return Math.abs(a) < Math.abs(b) ? a : b
}
