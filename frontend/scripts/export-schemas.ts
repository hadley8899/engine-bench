import { mkdirSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import {
  engineSchema,
  conditionsSchema,
  runSchema,
  recipeSchema,
} from '../src/sim/schema'
const targets = [
  new URL('../schemas/', import.meta.url),
  new URL('../../backend/resources/schemas/', import.meta.url),
]
for (const target of targets) mkdirSync(target, { recursive: true })
for (const [name, schema] of Object.entries({
  engine: engineSchema,
  conditions: conditionsSchema,
  run: runSchema,
  recipe: recipeSchema,
})) {
  for (const target of targets)
    writeFileSync(
      new URL(`${name}.schema.json`, target),
      // Input form: the backend validates submitted documents, where
      // defaulted fields (for example starterTorque) may be absent.
      JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2) + '\n',
    )
}
