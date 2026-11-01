import { api } from '../api/api'
import { conditionsSchema, engineSchema, runSchema } from '../sim/schema'
import type { Conditions, EngineDefinition, Run } from '../sim/schema'

export type Workspace = {
  uuid: string
  name: string
  kind: 'personal' | 'team'
  role: 'admin' | 'user'
  active: boolean
}
export type BuildSummary = {
  uuid: string
  name: string
  current_revision: number
  can_write: boolean
  created_at: string
  updated_at: string
}
export type Revision = {
  version: number
  engine: EngineDefinition
  conditions: Conditions
  created_at: string
}
export type SavedBuild = { build: BuildSummary; revision: Revision }
export type SavedRun = {
  uuid: string
  name: string
  build_uuid: string
  revision: number
  status: 'complete' | 'aborted'
  reason: string
  kind: 'sweep' | 'steps'
  sample_count: number
  sample_bytes: number
  peak_power: number | null
  peak_torque: number | null
  created_at: string
  verified: false
}
const options = (workspace: string) => ({
  headers: { 'X-Workspace-UUID': workspace },
})
function buildDocument(value: SavedBuild): SavedBuild {
  return {
    ...value,
    revision: {
      ...value.revision,
      engine: engineSchema.parse(value.revision.engine),
      conditions: conditionsSchema.parse(value.revision.conditions),
    },
  }
}
export const workspaces = async () =>
  (await api.get<{ workspaces: Workspace[] }>('/api/auth/workspaces')).data
    .workspaces
export const activateWorkspace = async (uuid: string) => {
  await api.post(`/api/auth/workspaces/${uuid}/activate`)
}
export const createWorkspace = async (name: string) => {
  await api.post('/api/auth/workspaces', { name })
}
export const listBuilds = async (workspace: string, page = 1) =>
  (
    await api.get<{ builds: BuildSummary[]; page: number; last_page: number }>(
      `/api/auth/builds?page=${page}`,
      options(workspace),
    )
  ).data
export const getBuild = async (
  workspace: string,
  uuid: string,
  version?: number,
) =>
  buildDocument(
    (
      await api.get<SavedBuild>(
        `/api/auth/builds/${uuid}${version ? `/revisions/${version}` : ''}`,
        options(workspace),
      )
    ).data,
  )
export const saveBuild = async (
  workspace: string,
  engine: EngineDefinition,
  conditions: Conditions,
  previous?: BuildSummary,
) => {
  const endpoint = previous
    ? `/api/auth/builds/${previous.uuid}/revisions`
    : '/api/auth/builds'
  const { data } = await api.post<SavedBuild>(
    endpoint,
    {
      engine,
      conditions,
      ...(previous ? { base_revision: previous.current_revision } : {}),
    },
    options(workspace),
  )
  return buildDocument(data)
}
export const listRuns = async (workspace: string, page = 1) =>
  (
    await api.get<{ runs: SavedRun[]; page: number; last_page: number }>(
      `/api/auth/runs?page=${page}`,
      options(workspace),
    )
  ).data
export const getRun = async (workspace: string, uuid: string) => {
  const { data } = await api.get<{ saved_run: SavedRun; run: Run }>(
    `/api/auth/runs/${uuid}`,
    options(workspace),
  )
  return { ...data, run: runSchema.parse(data.run) }
}
export const saveRun = async (workspace: string, build: SavedBuild, run: Run) =>
  (
    await api.post<{ saved_run: SavedRun }>(
      '/api/auth/runs',
      { build_uuid: build.build.uuid, revision: build.revision.version, run },
      options(workspace),
    )
  ).data.saved_run

export const findOwnRun = async (workspace: string, id: string) =>
  (await api.get<{ runs: SavedRun[] }>(
    `/api/auth/runs?client_run_id=${encodeURIComponent(id)}`, options(workspace),
  )).data.runs[0]
