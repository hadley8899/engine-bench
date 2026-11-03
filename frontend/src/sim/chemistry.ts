import type { FuelGrade } from './schema'
import type { FUELS } from './fuel'

/**
 * Burned-gas chemistry: equilibrium of CO2, CO, H2O, H2, OH, H, O2, O and
 * N2. Hot burned gas holds part of the fuel's heat in dissociated species
 * and releases it as it cools; below FREEZE the composition stops
 * changing, so a rich burn leaves CO and H2 in the exhaust. NO and
 * nitrogen dissociation are not included. See docs/SIMULATION.md
 * (Burned-gas chemistry).
 */
type Fuel = (typeof FUELS)[FuelGrade]

/**
 * log10 Kp = A − B/T (p in bar), fitted to NIST-JANAF log Kf of CO2, CO,
 * H2O, OH, H and O at 2,000 and 3,000 K; within 0.03 of the tables from
 * 1,500 to 3,500 K. Reactions: CO2 ⇌ CO + ½O2, H2O ⇌ H2 + ½O2,
 * H2O ⇌ ½H2 + OH, ½H2 ⇌ H and ½O2 ⇌ O.
 */
const CO2_A = 4.316
const CO2_B = 14394
const H2O_A = 3.048
const H2O_B = 13176
const OH_A = 3.75
const OH_B = 15060
const H_A = 3.173
const H_B = 11922
const O_A = 3.512
const O_B = 13374
/** Standard enthalpies of formation at 298 K (JANAF), J/mol. */
const FORMATION = {
  co2: -393.52e3,
  co: -110.53e3,
  h2o: -241.83e3,
  oh: 37.28e3,
  h: 217.99e3,
  o: 249.17e3,
}
/** Composition freezes below this temperature (Heywood's water–gas shift, K ≈ 3.5). */
export const FREEZE = 1740
/** Molar heat capacity at constant volume near 1,800 K (JANAF), J/(mol·K). */
const MOLAR_CV = { co2: 52.8, co: 27.8, h2o: 42.6, h2: 25.2, n2: 27.4 }
/** Nitrogen (with argon) per oxygen molecule in dry air. */
const NITROGEN_PER_OXYGEN = 3.773
/** Table grid: temperature from FREEZE, pressure on a log scale (bar). */
const T_STEP = 40
const T_COUNT = 51
const P_MIN = Math.log(0.5)
const P_MAX = Math.log(400)
const P_COUNT = 10
const P_STEP = (P_MAX - P_MIN) / (P_COUNT - 1)

type Composition = {
  co2: number
  co: number
  h2o: number
  h2: number
  oh: number
  h: number
  o2: number
  o: number
  n2: number
  total: number
  /** ln of the O2 mole fraction, a starting guess for a nearby state. */
  log: number
}
/**
 * Equilibrium products per carbon atom of a stoichiometric charge's fuel,
 * with φ times that fuel, at T (K) and p (bar). Solves the oxygen balance
 * for ln x(O2) by regula falsi (Illinois), from `guess` when given, with
 * the total moles iterated inside.
 */
function composition(
  fuel: Fuel,
  phi: number,
  temperature: number,
  bar: number,
  guess = -12,
): Composition {
  const y = fuel.hydrogen
  const z = fuel.oxygenAtoms
  const oxygen = 1 + y / 4 - z / 2
  const carbon = phi
  const hydrogen = (phi * y) / 2
  const atoms = 2 * oxygen + phi * z
  const n2 = NITROGEN_PER_OXYGEN * oxygen
  const k1 = 10 ** (CO2_A - CO2_B / temperature)
  const k2 = 10 ** (H2O_A - H2O_B / temperature)
  const k3 = 10 ** (OH_A - OH_B / temperature)
  const kh = 10 ** (H_A - H_B / temperature)
  const ko = 10 ** (O_A - O_B / temperature)
  const root = Math.sqrt(bar)
  let total = carbon + hydrogen + n2
  let co2 = 0,
    co = 0,
    h2o = 0,
    h2 = 0,
    oh = 0,
    h = 0,
    o2 = 0,
    o = 0
  /** Oxygen atoms bound at O2 mole fraction e^log, less those available. */
  const excess = (log: number) => {
    const x = Math.exp(log)
    const so = Math.sqrt(x * bar)
    co2 = carbon / (1 + k1 / so)
    co = carbon - co2
    // Hydrogen species from s = √x(H2): H2O = a·s², OH ∝ s, H ∝ s.
    const a = so / k2
    const quadratic = 2 * (1 + a)
    const linear = (k3 * a + kh) / root
    for (let i = 0; i < 4; i++) {
      const target = (2 * hydrogen) / total
      const s =
        (-linear + Math.sqrt(linear * linear + 4 * quadratic * target)) /
        (2 * quadratic)
      h2 = s * s * total
      h2o = a * h2
      oh = ((k3 * a * s) / root) * total
      h = ((kh * s) / root) * total
      o2 = x * total
      o = ((ko * Math.sqrt(x)) / root) * total
      total = co2 + co + h2o + h2 + oh + h + o2 + o + n2
    }
    return 2 * co2 + co + h2o + oh + 2 * o2 + o - atoms
  }
  // Bracket around the guess, then Illinois regula falsi.
  let lo = Math.max(-46, guess - 2)
  let hi = Math.min(0, guess + 2)
  let flo = excess(lo)
  while (flo > 0 && lo > -46) flo = excess((lo = Math.max(-46, lo - 6)))
  let fhi = excess(hi)
  while (fhi < 0 && hi < 0) fhi = excess((hi = Math.min(0, hi + 6)))
  let log = lo
  let side = 0
  for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
    log = (lo * fhi - hi * flo) / (fhi - flo)
    const f = excess(log)
    if (f === 0) break
    if (f < 0) {
      lo = log
      flo = f
      if (side === -1) fhi /= 2
      side = -1
    } else {
      hi = log
      fhi = f
      if (side === 1) flo /= 2
      side = 1
    }
  }
  excess(log)
  return { co2, co, h2o, h2, oh, h, o2, o, n2, total, log }
}
/** Heat released per carbon atom of a stoichiometric charge's fuel, J. */
function released(fuel: Fuel, phi: number, c: Composition, heat: number) {
  const fuelFormation =
    heat + FORMATION.co2 + (fuel.hydrogen / 2) * FORMATION.h2o
  return (
    phi * fuelFormation -
    (c.co2 * FORMATION.co2 +
      c.co * FORMATION.co +
      c.h2o * FORMATION.h2o +
      c.oh * FORMATION.oh +
      c.h * FORMATION.h +
      c.o * FORMATION.o)
  )
}
/** Products with every atom of fuel and oxygen fully burned (lean or stoichiometric). */
function completeMoles(fuel: Fuel, phi: number) {
  const y = fuel.hydrogen
  const oxygen = 1 + y / 4 - fuel.oxygenAtoms / 2
  const burned = Math.min(phi, 1)
  return (
    burned * (1 + y / 2) +
    (1 - burned) * oxygen +
    NITROGEN_PER_OXYGEN * oxygen
  )
}

export type RichProducts = {
  /** Heat released per unit of air, relative to a stoichiometric burn. */
  heat: number
  /** Product moles per unit of air, relative to stoichiometric products. */
  moles: number
  /** Product heat capacity per unit of air, relative to stoichiometric products. */
  capacity: number
}
const STOICHIOMETRIC_PRODUCTS: RichProducts = { heat: 1, moles: 1, capacity: 1 }
/**
 * Frozen products of a rich burn per unit of air, relative to the
 * stoichiometric products the gas model is calibrated on: the oxygen is
 * shared between CO2, CO, H2O and H2, so the gas gains moles and heat
 * capacity, and the CO and H2 carry heat the burn did not release. Lean
 * and stoichiometric burns return 1 for each.
 */
export function richProducts(fuel: Fuel, phi: number): RichProducts {
  if (!(phi > 1)) return STOICHIOMETRIC_PRODUCTS
  const c = composition(fuel, phi, FREEZE, 50)
  const y = fuel.hydrogen
  const molarMass = 0.012011 + 0.001008 * y + 0.015999 * fuel.oxygenAtoms
  const heat = fuel.heating * molarMass
  const stoichiometric = completeMoles(fuel, 1)
  const capacity = (c: Composition) =>
    c.co2 * MOLAR_CV.co2 +
    c.co * MOLAR_CV.co +
    c.h2o * MOLAR_CV.h2o +
    c.h2 * MOLAR_CV.h2 +
    c.n2 * MOLAR_CV.n2
  const reference = composition(fuel, 1, FREEZE, 50)
  return {
    heat: released(fuel, phi, c, heat) / heat,
    moles: (phi * (1 + y / 2) + c.n2) / stoichiometric,
    capacity: capacity(c) / capacity(reference),
  }
}

/** Mixture grid for cached tables; cylinders interpolate between points. */
const PHI_MIN = 0.6
const PHI_GRID = 0.025
const PHI_COUNT = 51

/** Equilibrium tables for one fuel and mixture, by temperature and pressure. */
class Table {
  readonly capacityGain: number
  readonly held = new Float64Array(T_COUNT * P_COUNT)
  readonly moles = new Float64Array(T_COUNT * P_COUNT)

  constructor(fuel: Fuel, phi: number) {
    this.capacityGain = richProducts(fuel, phi).capacity - 1
    const y = fuel.hydrogen
    const molarMass = 0.012011 + 0.001008 * y + 0.015999 * fuel.oxygenAtoms
    // Heat of the fuel, and of the fuel that can burn, per carbon atom of
    // a stoichiometric charge.
    const fullHeat = fuel.heating * molarMass
    const heat = Math.min(phi, 1) * fullHeat
    const complete = phi > 1 ? completeMoles(fuel, 1) : completeMoles(fuel, phi)
    let guess = -12
    let first = -12
    for (let i = 0; i < T_COUNT; i++)
      for (let j = 0; j < P_COUNT; j++) {
        const c = composition(
          fuel,
          phi,
          FREEZE + i * T_STEP,
          Math.exp(P_MIN + j * P_STEP),
          j === 0 ? first : guess,
        )
        guess = c.log
        if (j === 0) first = c.log
        const k = i * P_COUNT + j
        // Share of the burnable fuel's heat not yet released; a rich
        // charge's surplus fuel releases part of its own heat.
        this.held[k] = 1 - released(fuel, phi, c, fullHeat) / heat
        this.moles[k] = c.total / complete
      }
  }

  private static grids = new Map<Fuel, Table[]>()
  /** Every grid point for a fuel, so no table is built while the engine runs. */
  static prepare(fuel: Fuel) {
    for (let i = 0; i < PHI_COUNT; i++) Table.at(fuel, i)
  }
  /** Grid point i for a fuel, built on first use (about 1.5 ms). */
  static at(fuel: Fuel, i: number) {
    let grid = Table.grids.get(fuel)
    if (!grid) Table.grids.set(fuel, (grid = []))
    return (grid[i] ??= new Table(fuel, PHI_MIN + i * PHI_GRID))
  }
}

/**
 * A cylinder's burned gas: the share of its burn's heat held back by
 * dissociation (and, rich, as frozen CO and H2), and its moles relative to
 * complete products, by temperature and pressure. Read `held`, `heldSlope`
 * and `moles` after `at()`.
 */
export class BurnedGas {
  /** Frozen rich products' extra heat capacity per unit of burned air. */
  capacityGain = 0
  phi = NaN
  held = 0
  /** d(held)/dT, 1/K. */
  heldSlope = 0
  moles = 1
  private fuel: Fuel | null = null
  private heldTable = new Float64Array(T_COUNT * P_COUNT)
  private molesTable = new Float64Array(T_COUNT * P_COUNT)

  /**
   * Build a fuel's tables (about 70 ms, once per fuel and thread) before
   * an engine runs on it.
   */
  static prepare(fuel: Fuel) {
    Table.prepare(fuel)
  }
  /** Use a fuel and mixture, interpolating the cached mixture grid. */
  set(fuel: Fuel, phi: number) {
    const q = Math.min(Math.max(phi, PHI_MIN), PHI_MIN + PHI_GRID * (PHI_COUNT - 1))
    if (fuel === this.fuel && Math.abs(q - this.phi) < 0.001) return
    this.fuel = fuel
    this.phi = q
    const x = (q - PHI_MIN) / PHI_GRID
    const i = Math.min(Math.floor(x), PHI_COUNT - 2)
    const f = x - i
    const a = Table.at(fuel, i)
    const b = f > 0 ? Table.at(fuel, i + 1) : a
    for (let k = 0; k < this.heldTable.length; k++) {
      this.heldTable[k] = a.held[k] + (b.held[k] - a.held[k]) * f
      this.molesTable[k] = a.moles[k] + (b.moles[k] - a.moles[k]) * f
    }
    this.capacityGain = a.capacityGain + (b.capacityGain - a.capacityGain) * f
  }
  /** Take over another cylinder's tables, as a live update does. */
  adopt(previous: BurnedGas) {
    this.fuel = previous.fuel
    this.phi = previous.phi
    this.capacityGain = previous.capacityGain
    this.heldTable.set(previous.heldTable)
    this.molesTable.set(previous.molesTable)
  }
  /** Bilinear lookup at T (K) and p (Pa); held flat below FREEZE. */
  at(temperature: number, pressure: number) {
    let ti = (temperature - FREEZE) / T_STEP
    let slope = 1 / T_STEP
    if (ti <= 0) {
      ti = 0
      slope = 0
    } else if (ti >= T_COUNT - 1) {
      ti = T_COUNT - 1 - 1e-9
      slope = 0
    }
    let pi = (Math.log(Math.max(pressure, 1) / 1e5) - P_MIN) / P_STEP
    pi = Math.min(Math.max(pi, 0), P_COUNT - 1 - 1e-9)
    const i = Math.floor(ti)
    const j = Math.floor(pi)
    const ft = ti - i
    const fp = pi - j
    const k = i * P_COUNT + j
    const h = this.heldTable
    const m = this.molesTable
    const low = h[k] + (h[k + 1] - h[k]) * fp
    const high = h[k + P_COUNT] + (h[k + P_COUNT + 1] - h[k + P_COUNT]) * fp
    this.held = low + (high - low) * ft
    this.heldSlope = (high - low) * slope
    const mLow = m[k] + (m[k + 1] - m[k]) * fp
    const mHigh = m[k + P_COUNT] + (m[k + P_COUNT + 1] - m[k + P_COUNT]) * fp
    this.moles = mLow + (mHigh - mLow) * ft
  }
}
