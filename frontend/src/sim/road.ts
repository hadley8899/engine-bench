import { z } from 'zod'
import { clamp } from './physics'

/**
 * Optional road load for the bench: a vehicle the engine drives through a
 * gearbox and an automatic clutch. It is a load model only. The bench still
 * reports crank output; there is no tyre, driveline-loss or wheel-power model.
 */
export const roadSchema = z.strictObject({
  /** Vehicle and rider or driver, kg. */
  mass: z.number().min(80).max(5000),
  /** Gear ratios, first gear first. */
  ratios: z.array(z.number().min(0.3).max(6)).min(1).max(8),
  /** Every reduction after the gearbox; on a motorcycle, primary × sprockets. */
  finalDrive: z.number().min(1.5).max(15),
  /** Rolling radius of the driven tyres, m. */
  tyreRadius: z.number().min(0.2).max(0.5),
  /** Drag coefficient × frontal area, m². */
  dragArea: z.number().min(0.1).max(2),
  /** Rolling-resistance coefficient. */
  rolling: z.number().min(0.005).max(0.03),
  /** The automatic clutch starts to bite here and is fully engaged 700 RPM higher. */
  launchRpm: z.number().min(600).max(12000),
  /** Torque the clutch can carry at the crank, Nm. */
  clutchCapacity: z.number().min(10).max(2000),
  /** Selected gear: 0 is neutral. */
  gear: z.number().int().min(0).max(8),
})
export type Road = z.infer<typeof roadSchema>

/**
 * Vehicles to drive. Illustrative, not real vehicles: the motorcycles fold
 * the primary drive and sprockets into the final drive, and launch higher
 * on a clutch sized for their engines, as a rider slips the clutch.
 */
export const vehicles = {
  hatchback: {
    label: 'Hatchback, six-speed',
    road: {
      mass: 1350,
      ratios: [3.36, 2.09, 1.47, 1.1, 0.87, 0.71],
      finalDrive: 3.94,
      tyreRadius: 0.31,
      dragArea: 0.66,
      rolling: 0.011,
      launchRpm: 900,
      clutchCapacity: 600,
      gear: 1,
    },
  },
  motorcycle: {
    label: 'Road motorcycle, 250–400 cc',
    road: {
      mass: 240,
      ratios: [2.57, 1.77, 1.38, 1.17, 1.04, 0.96],
      finalDrive: 6.3,
      tyreRadius: 0.31,
      dragArea: 0.45,
      rolling: 0.014,
      launchRpm: 3500,
      clutchCapacity: 150,
      gear: 1,
    },
  },
  trail125: {
    label: '125 trail bike',
    road: {
      mass: 200,
      ratios: [2.83, 1.88, 1.4, 1.13, 0.96, 0.83],
      finalDrive: 10,
      tyreRadius: 0.31,
      dragArea: 0.55,
      rolling: 0.015,
      launchRpm: 4000,
      clutchCapacity: 60,
      gear: 1,
    },
  },
  race125: {
    label: '125 race bike',
    road: {
      mass: 140,
      ratios: [2, 1.6, 1.35, 1.17, 1.05, 0.96],
      finalDrive: 7.2,
      tyreRadius: 0.3,
      dragArea: 0.3,
      rolling: 0.012,
      launchRpm: 9000,
      clutchCapacity: 50,
      gear: 1,
    },
  },
  moped: {
    label: 'Moped, four-speed',
    road: {
      mass: 160,
      ratios: [3, 1.9, 1.4, 1.1],
      finalDrive: 12,
      tyreRadius: 0.28,
      dragArea: 0.6,
      rolling: 0.015,
      launchRpm: 3500,
      clutchCapacity: 25,
      gear: 1,
    },
  },
} satisfies Record<string, { label: string; road: Road }>
export type VehicleKey = keyof typeof vehicles
/** A small hatchback with a six-speed gearbox; illustrative, not a real car. */
export const roadDefaults: Road = vehicles.hatchback.road

/** A vehicle that suits an engine of this size (m³) and rev limit. */
export function suggestedVehicle(displacement: number, revLimit: number): VehicleKey {
  if (displacement < 80e-6) return 'moped'
  if (displacement < 200e-6) return revLimit >= 11000 ? 'race125' : 'trail125'
  if (displacement < 700e-6) return 'motorcycle'
  return 'hatchback'
}
/** The preset these settings match, ignoring the selected gear. */
export function vehicleKey(road: Road): VehicleKey | null {
  const same = (a: Road, b: Road) =>
    JSON.stringify({ ...a, gear: 0 }) === JSON.stringify({ ...b, gear: 0 })
  return (
    (Object.keys(vehicles) as VehicleKey[]).find((k) => same(vehicles[k].road, road)) ?? null
  )
}
export function validateRoad(road: Road) {
  const r = roadSchema.parse(road)
  if (r.gear > r.ratios.length)
    throw new Error(`Gear ${r.gear} is not in a ${r.ratios.length}-speed box.`)
  return r
}

/** The clutch's slip stiffness, Nm per rad/s. */
const CLUTCH_STIFFNESS = 150

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
      const engaged = clamp((rpm - road.launchRpm) / 700, 0, 1)
      const shaft = (this.speed * ratio) / road.tyreRadius
      clutch = clamp(
        CLUTCH_STIFFNESS * (omega - shaft),
        -road.clutchCapacity * engaged,
        road.clutchCapacity * engaged,
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
