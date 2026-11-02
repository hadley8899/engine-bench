import { z } from 'zod'
import { clamp } from './physics'

/**
 * Optional road load for the bench: a vehicle the engine drives through a
 * gearbox and an automatic clutch. It is a load model only. The bench still
 * reports crank output; there is no tyre, driveline-loss or wheel-power model.
 */
export const roadSchema = z.strictObject({
  /** Vehicle and driver, kg. */
  mass: z.number().min(300).max(5000),
  /** Gear ratios, first gear first. */
  ratios: z.array(z.number().min(0.3).max(6)).min(1).max(8),
  finalDrive: z.number().min(1.5).max(8),
  /** Rolling radius of the driven tyres, m. */
  tyreRadius: z.number().min(0.2).max(0.5),
  /** Drag coefficient × frontal area, m². */
  dragArea: z.number().min(0.1).max(2),
  /** Rolling-resistance coefficient. */
  rolling: z.number().min(0.005).max(0.03),
  /** Selected gear: 0 is neutral. */
  gear: z.number().int().min(0).max(8),
})
export type Road = z.infer<typeof roadSchema>
/** A small hatchback with a six-speed gearbox; illustrative, not a real car. */
export const roadDefaults: Road = {
  mass: 1350,
  ratios: [3.36, 2.09, 1.47, 1.1, 0.87, 0.71],
  finalDrive: 3.94,
  tyreRadius: 0.31,
  dragArea: 0.66,
  rolling: 0.011,
  gear: 1,
}
export function validateRoad(road: Road) {
  const r = roadSchema.parse(road)
  if (r.gear > r.ratios.length)
    throw new Error(`Gear ${r.gear} is not in a ${r.ratios.length}-speed box.`)
  return r
}

/** Torque the clutch can carry, Nm, and its slip stiffness, Nm per rad/s. */
const CLUTCH_CAPACITY = 600
const CLUTCH_STIFFNESS = 150
/** The automatic clutch starts to bite here and is fully engaged 700 RPM higher. */
const BITE_RPM = 900

export class Vehicle {
  /** Road speed, m/s. */
  speed = 0
  /** Torque the clutch takes from the crank, Nm (negative when driven). */
  clutchTorque = 0
  /**
   * Advances the vehicle by dt and returns the torque it takes from the
   * crank. The clutch slips in proportion to the speed difference, up to its
   * capacity, so launches and gear changes need no special cases.
   */
  step(road: Road, omega: number, rpm: number, airDensity: number, dt: number) {
    const ratio =
      road.gear > 0 && road.gear <= road.ratios.length
        ? road.ratios[road.gear - 1] * road.finalDrive
        : 0
    let clutch = 0
    if (ratio > 0) {
      const engaged = clamp((rpm - BITE_RPM) / 700, 0, 1)
      const shaft = (this.speed * ratio) / road.tyreRadius
      clutch = clamp(
        CLUTCH_STIFFNESS * (omega - shaft),
        -CLUTCH_CAPACITY * engaged,
        CLUTCH_CAPACITY * engaged,
      )
    }
    const drive = ratio > 0 ? (clutch * ratio) / road.tyreRadius : 0
    const resist =
      this.speed > 0
        ? road.rolling * road.mass * 9.81 +
          0.5 * airDensity * road.dragArea * this.speed * this.speed
        : 0
    this.speed = Math.max(0, this.speed + ((drive - resist) / road.mass) * dt)
    this.clutchTorque = clutch
    return clutch
  }
}
