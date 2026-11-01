import { NumberField } from './NumberField'
import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from '@mui/material'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { recipeSchema } from '../sim/schema'
import type { Conditions, EngineDefinition, Run } from '../sim/schema'
import * as storage from '../services/benchStorageService'
import type {
  BuildSummary,
  SavedBuild,
  SavedRun,
  Workspace,
} from '../services/benchStorageService'

function errorMessage(err: unknown): string {
  if (isAxiosError(err) && typeof err.response?.data?.message === 'string')
    return err.response.data.message
  return err instanceof Error ? err.message : String(err)
}

export function SavedLibrary({
  engine,
  conditions,
  baseline,
  modified,
  locked,
  dirty,
  onLoadBuild,
  onLoadRun,
  onRerun,
  onWorkspaceChange,
}: {
  engine: EngineDefinition
  conditions: Conditions
  baseline: Run | null
  modified: Run | null
  locked: boolean
  dirty: boolean
  onLoadBuild: (engine: EngineDefinition, conditions: Conditions) => void
  onLoadRun: (run: Run, slot: 'baseline' | 'modified') => void
  onRerun: (run: Run) => Promise<void>
  onWorkspaceChange: () => void
}) {
  const { user, company, refreshUser } = useAuth()
  const [reload, setReload] = useState(0)
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([])
  const [builds, setBuilds] = useState<BuildSummary[]>([])
  const [runs, setRuns] = useState<SavedRun[]>([])
  const [selection, setSelection] = useState<
    (SavedBuild & { workspace: string }) | null
  >(null)
  const [revisionNumber, setRevisionNumber] = useState(1)
  const [buildPage, setBuildPage] = useState(1)
  const [runPage, setRunPage] = useState(1)
  const [buildLast, setBuildLast] = useState(1)
  const [runLast, setRunLast] = useState(1)
  const [loadedScope, setLoadedScope] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [teamName, setTeamName] = useState('')
  const scope = company?.uuid ?? ''
  const scopeRef = useRef(scope)
  useEffect(() => {
    scopeRef.current = scope
  }, [scope])
  const selected = selection?.workspace === scope ? selection : null
  const libraryReady = loadedScope === scope && !!user && !!scope
  useEffect(() => {
    if (!user || !scope) return
    let cancelled = false
    const fetch = async () => {
      try {
        const [workspaces, savedBuilds, savedRuns] = await Promise.all([
          storage.workspaces(),
          storage.listBuilds(scope, buildPage),
          storage.listRuns(scope, runPage),
        ])
        if (cancelled) return
        setWorkspaceList(workspaces)
        setBuilds(savedBuilds.builds)
        setRuns(savedRuns.runs)
        setBuildLast(savedBuilds.last_page)
        setRunLast(savedRuns.last_page)
        setLoadedScope(scope)
        setError('')
      } catch (err) {
        if (!cancelled)
          setError(errorMessage(err))
      }
    }
    void fetch()
    return () => {
      cancelled = true
    }
  }, [user, scope, reload, buildPage, runPage])
  const action = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const refresh = async () => {
    await refreshUser()
    setReload((value) => value + 1)
  }
  const loadBuild = async (uuid: string, version?: number) => {
    const result = await storage.getBuild(scope, uuid, version)
    if (scopeRef.current !== scope) return
    onLoadBuild(result.revision.engine, result.revision.conditions)
    setSelection({ ...result, workspace: scope })
    setRevisionNumber(result.revision.version)
    setNotice(
      `Loaded ${result.build.name}, revision ${result.revision.version}. Previous local build and comparison slots were retained.`,
    )
  }
  const persistBuild = async (asRevision: boolean) => {
    const result = await storage.saveBuild(
      scope,
      engine,
      conditions,
      asRevision && selected ? selected.build : undefined,
    )
    if (scopeRef.current !== scope) return
    setSelection({ ...result, workspace: scope })
    setRevisionNumber(result.revision.version)
    setNotice(
      `Saved ${result.build.name}, revision ${result.revision.version}, to ${company?.name}.`,
    )
    setReload((v) => v + 1)
  }
  const sameSnapshot = (
    a: { engine: EngineDefinition; conditions: Conditions },
    b: { engine: EngineDefinition; conditions: Conditions },
  ) =>
    JSON.stringify(recipeSchema.parse({ format: 'engine-bench/1', engine: a.engine, conditions: a.conditions })) ===
    JSON.stringify(recipeSchema.parse({ format: 'engine-bench/1', engine: b.engine, conditions: b.conditions }))
  const persistRun = async (run: Run | null, slot: string) => {
    if (!run || run.status === 'running') return
    let target: SavedBuild
    const existing = await storage.findOwnRun(scope, run.id)
    if (existing)
      target = await storage.getBuild(scope, existing.build_uuid, existing.revision)
    else if (
      selected &&
      selected.build.can_write &&
      sameSnapshot(selected.revision, run)
    )
      target = selected
    else target = await storage.saveBuild(scope, run.engine, run.conditions)
    const saved = await storage.saveRun(scope, target, run)
    if (scopeRef.current !== scope) return
    if (sameSnapshot({ engine, conditions }, run)) {
      setSelection({ ...target, workspace: scope })
      setRevisionNumber(target.revision.version)
    }
    setNotice(
      `${slot} saved with revision ${saved.revision}. Its samples and snapshots are immutable; results remain unverified.`,
    )
    setReload((v) => v + 1)
  }
  const restoreRun = async (uuid: string, slot: 'baseline' | 'modified') => {
    const value = await storage.getRun(scope, uuid)
    if (scopeRef.current !== scope) return
    onLoadRun(value.run, slot)
    setNotice(
      `Loaded saved run into ${slot}. Current bench geometry was not changed. Use Restore baseline or Rerun to restore its configuration.`,
    )
  }
  if (!user)
    return (
      <Paper className="editor-panel saved-library" variant="outlined">
        <div className="eyebrow">YOUR ENGINE LIBRARY</div>
        <h2>Keep a build. Come back to its story.</h2>
        <p>
          Sign in to save engine revisions and dyno runs. Your guest build,
          pending edits and comparisons stay in this tab through sign-in.
        </p>
        <Button component={Link} to="/login" variant="outlined">
          Sign in to save builds & runs
        </Button>
      </Paper>
    )
  return (
    <Paper className="editor-panel saved-library" variant="outlined">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">YOUR ENGINE LIBRARY</div>
          <h2>Saved builds & runs</h2>
        </div>
        <Button disabled={busy} onClick={() => void action(refresh)}>
          Refresh library
        </Button>
      </div>
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="info" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <div className="library-workspace">
        <TextField
          select
          size="small"
          label="Save to workspace"
          value={workspaceList.some((w) => w.uuid === scope) ? scope : ''}
          disabled={busy || locked}
          onChange={(e) =>
            void action(async () => {
              onWorkspaceChange()
              await storage.activateWorkspace(e.target.value)
              setBuildPage(1)
              setRunPage(1)
              await refresh()
            })
          }
        >
          {workspaceList.map((w) => (
            <MenuItem key={w.uuid} value={w.uuid}>
              {w.name} · {w.kind}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="New team name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />
        <Button
          disabled={busy || locked || !teamName.trim()}
          onClick={() =>
            void action(async () => {
              onWorkspaceChange()
              await storage.createWorkspace(teamName.trim())
              setTeamName('')
              setBuildPage(1)
              setRunPage(1)
              await refresh()
            })
          }
        >
          Create team workspace
        </Button>
      </div>
      <p className="helper-text">
        Personal workspaces are private. Teams share saved records with their
        members. Switching workspaces keeps your local bench; check the
        destination before saving.
      </p>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          variant="contained"
          disabled={!libraryReady || busy || locked || dirty}
          onClick={() => void action(() => persistBuild(false))}
        >
          Save as new build
        </Button>
        <Button
          variant="outlined"
          disabled={!libraryReady || !selected?.build.can_write || busy || locked || dirty}
          onClick={() => void action(() => persistBuild(true))}
        >
          Save new revision
        </Button>
        <Button
          disabled={
            !libraryReady || !baseline || baseline.status === 'running' || busy || locked
          }
          onClick={() => void action(() => persistRun(baseline, 'Baseline'))}
        >
          Save baseline run
        </Button>
        <Button
          disabled={
            !libraryReady || !modified || modified.status === 'running' || busy || locked
          }
          onClick={() => void action(() => persistRun(modified, 'Modified'))}
        >
          Save modified run
        </Button>
      </Stack>
      {dirty && (
        <p className="pending-note">
          Rebuild to apply edits before saving the current build. Run saves use
          their own tested snapshots.
        </p>
      )}
      <p className="helper-text">
        Saving a run creates a build for its tested snapshot if no matching
        loaded revision is available. Other members can read team builds; only
        their author or a team administrator can add revisions or attach runs.
      </p>
      {selected && (
        <div className="loaded-build">
          <strong>Loaded: {selected.build.name}</strong>
          <p>
            Revision {selected.revision.version} · latest saved revision{' '}
            {selected.build.current_revision}
            {!selected.build.can_write && ' · read only (save a copy to edit)'}
          </p>
          <Stack direction="row" spacing={1}>
            <NumberField
              size="small"
              label="Historical revision"
              value={revisionNumber}
              slotProps={{
                htmlInput: {
                  min: 1,
                  max: selected.build.current_revision,
                  step: 1,
                },
              }}
              onValueChange={setRevisionNumber}
            />
            <Button
              disabled={
                busy ||
                locked ||
                !Number.isInteger(revisionNumber) ||
                revisionNumber < 1 ||
                revisionNumber > selected.build.current_revision
              }
              onClick={() =>
                void action(() =>
                  loadBuild(selected.build.uuid, revisionNumber),
                )
              }
            >
              Load revision
            </Button>
          </Stack>
        </div>
      )}
      {!libraryReady ? (
        <p>Loading workspace library…</p>
      ) : (
        <div className="library-columns">
          <div>
            <h3>Builds</h3>
            {builds.length === 0 && (
              <p>No saved builds yet. Your current engine is ready to save.</p>
            )}
            {builds.map((build) => (
              <div className="library-entry" key={build.uuid}>
                <div>
                  <strong>{build.name}</strong>
                  <small>
                    Revision {build.current_revision} ·{' '}
                    {new Date(build.updated_at).toLocaleString()}
                    {!build.can_write && ' · read only'}
                  </small>
                </div>
                <Button
                  size="small"
                  disabled={busy || locked}
                  onClick={() => void action(() => loadBuild(build.uuid))}
                >
                  Load build
                </Button>
              </div>
            ))}
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                disabled={buildPage <= 1 || busy}
                onClick={() => setBuildPage((v) => v - 1)}
              >
                Previous builds
              </Button>
              <small>
                {buildPage} / {buildLast}
              </small>
              <Button
                disabled={buildPage >= buildLast || busy}
                onClick={() => setBuildPage((v) => v + 1)}
              >
                Next builds
              </Button>
            </Stack>
          </div>
          <div>
            <h3>Dyno history</h3>
            {runs.length === 0 && (
              <p>No saved runs yet. Capture a baseline, then save it here.</p>
            )}
            {runs.map((value) => (
              <div className="library-entry run-entry" key={value.uuid}>
                <strong>
                  {value.name} · revision {value.revision}
                </strong>
                <small>
                  {new Date(value.created_at).toLocaleString()} · {value.kind} ·{' '}
                  {value.sample_count} points
                </small>
                <div>
                  <Chip size="small" label={value.status.toUpperCase()} />
                  <span>
                    {value.peak_power?.toFixed(1) ?? '—'} kW ·{' '}
                    {value.peak_torque?.toFixed(1) ?? '—'} Nm · unverified
                  </span>
                </div>
                {value.reason && <small>{value.reason}</small>}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    disabled={busy || locked}
                    onClick={() =>
                      void action(() => restoreRun(value.uuid, 'baseline'))
                    }
                  >
                    Load as baseline
                  </Button>
                  <Button
                    size="small"
                    disabled={busy || locked}
                    onClick={() =>
                      void action(() => restoreRun(value.uuid, 'modified'))
                    }
                  >
                    Load as modified
                  </Button>
                  <Button
                    size="small"
                    disabled={busy || locked}
                    onClick={() =>
                      void action(async () => {
                        const result = await storage.getRun(scope, value.uuid)
                        if (scopeRef.current === scope)
                          await onRerun(result.run)
                      })
                    }
                  >
                    Rerun into Modified
                  </Button>
                </Stack>
              </div>
            ))}
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                disabled={runPage <= 1 || busy}
                onClick={() => setRunPage((v) => v - 1)}
              >
                Previous runs
              </Button>
              <small>
                {runPage} / {runLast}
              </small>
              <Button
                disabled={runPage >= runLast || busy}
                onClick={() => setRunPage((v) => v + 1)}
              >
                Next runs
              </Button>
            </Stack>
          </div>
        </div>
      )}
    </Paper>
  )
}
