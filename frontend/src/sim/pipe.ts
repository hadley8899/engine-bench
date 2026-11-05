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
  private ambientPressure: number
  private ambientDensity: number
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
  ) {
    const length = segments.reduce((s, g) => s + g.length, 0)
    this.length = length
    const n = Math.max(4, Math.round(length / CELL))
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
    let fastest = 1
    for (let i = 0; i < this.cells; i++) {
      const rho = this.q0[i] * this.inverseArea[i]
      const inverse = 1 / this.q0[i]
      const u = this.q1[i] * inverse
      const e = this.q2[i] * inverse - 0.5 * u * u
      const t = temperatureFromEnergy(e)
      if (!(rho > 0) || !(t > 30) || !(t < 6000))
        throw new Error('Exhaust pipe flow left the supported model range.')
      this.rho[i] = rho
      this.u[i] = u
      this.t[i] = t
      this.p[i] = rho * R * t
      this.yf[i] = Math.min(1, Math.max(0, this.q3[i] * inverse))
      this.yb[i] = Math.max(0, this.q4[i] * inverse)
      const g = gamma(t)
      this.g1[i] = g - 1
      const c = Math.sqrt(g * R * t)
      this.c[i] = c
      const speed = Math.abs(u) + c
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
    for (let f = 1; f < n; f++) this.hllc(f)
    // Port face: the cylinder's flow, carrying its momentum into the pipe.
    const a0 = this.faceArea[0]
    this.f0[0] = flow
    this.f1[0] = p[0] * a0 + (flow * Math.abs(flow)) / (rho[0] * a0)
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
    this.hllc(n)
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
        r * p[i] * (this.faceArea[i + 1] - this.faceArea[i]) +
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
   * HLLC flux through face f (Davis wave-speed estimates), times the face
   * area: mass, momentum, energy and the two scalars.
   */
  private hllc(f: number) {
    const rl = this.lr[f],
      ul = this.lu[f],
      pl = this.lp[f]
    const rr = this.rr[f],
      ur = this.ru[f],
      pr = this.rp[f]
    const tl = (pl * INV_R) / rl
    const tr = (pr * INV_R) / rr
    // Wave speeds from the neighbouring cells' sound speeds (the outlet
    // ghost shares the last cell's).
    const al = this.c[f - 1]
    const ar = this.c[f < this.cells ? f : f - 1]
    const el = rl * (internalEnergy(tl) + 0.5 * ul * ul)
    const er = rr * (internalEnergy(tr) + 0.5 * ur * ur)
    const sl = Math.min(ul - al, ur - ar)
    const sr = Math.max(ul + al, ur + ar)
    let m0: number, m1: number, m2: number, m3: number, m4: number
    if (sl >= 0 || sr <= 0) {
      const left = sl >= 0
      const d = left ? rl : rr
      const v = left ? ul : ur
      const q = left ? pl : pr
      const e = left ? el : er
      const m = d * v
      m0 = m
      m1 = m * v + q
      m2 = v * (e + q)
      m3 = m * (left ? this.lf[f] : this.rf[f])
      m4 = m * (left ? this.lb[f] : this.rb[f])
    } else {
      const ml = rl * (sl - ul)
      const mr = rr * (sr - ur)
      const star = (pr - pl + ml * ul - mr * ur) / (ml - mr)
      const left = star >= 0
      const d = left ? rl : rr
      const v = left ? ul : ur
      const q = left ? pl : pr
      const e = left ? el : er
      const s = left ? sl : sr
      const y3 = left ? this.lf[f] : this.rf[f]
      const y4 = left ? this.lb[f] : this.rb[f]
      const m = d * v
      const ds = (d * (s - v)) / (s - star)
      const es = ds * (e / d + (star - v) * (star + q / (d * (s - v))))
      m0 = m + s * (ds - d)
      m1 = m * v + q + s * (ds * star - m)
      m2 = v * (e + q) + s * (es - e)
      m3 = m0 * y3
      m4 = m0 * y4
    }
    const a = this.faceArea[f]
    this.f0[f] = m0 * a
    this.f1[f] = m1 * a
    this.f2[f] = m2 * a
    this.f3[f] = m3 * a
    this.f4[f] = m4 * a
  }
}

function minmod(a: number, b: number) {
  if (a * b <= 0) return 0
  return Math.abs(a) < Math.abs(b) ? a : b
}
