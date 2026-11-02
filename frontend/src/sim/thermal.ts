/**
 * Lumped per-cylinder component temperatures. They observe the simulated
 * gas (wall heat flow and port outflow) and never change it: a run's
 * torque and pressures are the same with or without them. Constants are
 * calibration choices; see docs/SIMULATION.md.
 */

/** Crown conductance to oil and liner per m² of piston area, W/K, and time constant, s. */
const CROWN_CONDUCTANCE = 5500
const CROWN_TIME = 4
/** Combustion-deck conductance to coolant per m² of piston area, W/K, and time constant, s. */
const HEAD_CONDUCTANCE = 8200
const HEAD_TIME = 15
/** Exhaust valve: heat from port gas against conduction through seat and stem to the head. */
const VALVE_GAS_SHARE = 1.9
const VALVE_TIME = 2
/** Knock scours the thermal boundary layer: crown heat flow × (1 + 4 × intensity). */
const KNOCK_HEAT = 4
/** Exhaust thermocouple-style smoothing of per-cycle port gas temperature, s. */
const EGT_TIME = 0.25
/** Oil (and liner) runs this far above the coolant, K. */
const OIL_ABOVE_COOLANT = 10

export class CylinderThermal {
  /** Flow-weighted temperature of gas leaving the exhaust port, smoothed, K. */
  egt: number
  crown: number
  valve: number
  head: number
  /** Accumulators since the last update. */
  crownHeat = 0
  headHeat = 0
  outflow = 0
  /** Current exhaust event: mass and mass × temperature. */
  private eventMass = 0
  private eventEnergy = 0
  private eventTime = 0

  constructor(temperature: number) {
    this.egt = this.crown = this.valve = this.head = temperature
  }
  /** Gas leaving through the exhaust valve this substep. */
  exhaust(mass: number, temperature: number) {
    this.eventMass += mass
    this.eventEnergy += mass * temperature
    this.outflow += mass
  }
  /** The exhaust valve has closed: fold this cycle's port temperature in. */
  closeExhaust(time: number) {
    if (this.eventMass > 0) {
      const cycle = this.eventEnergy / this.eventMass
      const k = 1 - Math.exp(-(time - this.eventTime) / EGT_TIME)
      this.egt += (cycle - this.egt) * k
    }
    this.eventTime = time
    this.eventMass = 0
    this.eventEnergy = 0
  }
  /**
   * Advance the component temperatures over dt from the accumulated heat.
   * @param pistonArea   m², scales conductance and heat capacity
   * @param flowScale    exhaust mass flow per cylinder at the reference, kg/s
   * @param knock        last cycle's knock intensity
   */
  update(
    dt: number,
    coolant: number,
    pistonArea: number,
    flowScale: number,
    knock: number,
  ) {
    const oil = coolant + OIL_ABOVE_COOLANT
    const crownG = CROWN_CONDUCTANCE * pistonArea
    const headG = HEAD_CONDUCTANCE * pistonArea
    const crownIn = (this.crownHeat / dt) * (1 + KNOCK_HEAT * knock)
    this.crown +=
      ((crownIn - crownG * (this.crown - oil)) * dt) / (crownG * CROWN_TIME)
    this.head +=
      ((this.headHeat / dt - headG * (this.head - coolant)) * dt) /
      (headG * HEAD_TIME)
    // Port gas heats the valve harder the more of it flows past.
    const gas = VALVE_GAS_SHARE * (this.outflow / dt / flowScale) ** 0.8
    const target = (gas * this.egt + this.head) / (gas + 1)
    this.valve += (target - this.valve) * (1 - Math.exp(-dt * (gas + 1) / VALVE_TIME))
    this.crownHeat = 0
    this.headHeat = 0
    this.outflow = 0
  }
  adopt(previous: CylinderThermal) {
    this.egt = previous.egt
    this.crown = previous.crown
    this.valve = previous.valve
    this.head = previous.head
    this.crownHeat = previous.crownHeat
    this.headHeat = previous.headHeat
    this.outflow = previous.outflow
    this.eventMass = previous.eventMass
    this.eventEnergy = previous.eventEnergy
    this.eventTime = previous.eventTime
  }
}
