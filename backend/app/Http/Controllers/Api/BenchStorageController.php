<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CompanyUser;
use App\Models\DynoRun;
use App\Models\EngineBuild;
use App\Models\EngineBuildRevision;
use App\Models\User;
use App\Services\BenchDocuments;
use App\Services\Workspaces;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BenchStorageController extends Controller
{
    private function membership(Request $request): CompanyUser
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        app(Workspaces::class)->ensurePersonal($user);
        $membership = $user->currentCompanyUser();
        abort_unless($membership instanceof CompanyUser, 403);
        abort_if($membership->company->personal_owner_id !== null && $membership->company->personal_owner_id !== $user->id, 403);

        if ($request->hasHeader('X-Workspace-UUID')) {
            abort_unless($request->header('X-Workspace-UUID') === $membership->company->uuid, 409, 'The active workspace changed in another tab. Refresh the library before saving.');
        }

        return $membership;
    }

    private function bounded(Request $request): void
    {
        abort_if(strlen($request->getContent()) > BenchDocuments::MAX_BODY_BYTES, 413, 'Bench documents must be at most 1 MiB.');
    }

    private function build(Request $request, EngineBuild $build, bool $write = false): EngineBuild
    {
        $membership = $this->membership($request);
        abort_unless($build->company_id === $membership->company_id, 404);
        if ($write) {
            abort_unless($build->created_by_user_id === $request->user()->id || $membership->isAdmin(), 403);
        }

        return $build;
    }

    private function buildSummary(EngineBuild $build, Request $request): array
    {
        return [
            'uuid' => $build->uuid, 'name' => $build->name, 'current_revision' => (int) $build->current_revision,
            'created_at' => $build->created_at->toISOString(), 'updated_at' => $build->updated_at->toISOString(),
            'can_write' => $build->created_by_user_id === $request->user()->id || $request->user()->currentCompanyUser()->isAdmin(),
        ];
    }

    private function revisionDocument(EngineBuildRevision $revision): array
    {
        return ['version' => $revision->version, 'engine' => $revision->engine, 'conditions' => $revision->conditions, 'created_at' => $revision->created_at->toISOString()];
    }

    public function index(Request $request): JsonResponse
    {
        $membership = $this->membership($request);
        $page = EngineBuild::query()->where('company_id', $membership->company_id)->latest('updated_at')->latest('id')->paginate(20);

        return response()->json(['builds' => $page->getCollection()->map(fn ($b) => $this->buildSummary($b, $request)), 'page' => $page->currentPage(), 'last_page' => $page->lastPage()]);
    }

    public function store(Request $request, BenchDocuments $documents): JsonResponse
    {
        $this->bounded($request);
        $membership = $this->membership($request);
        $snapshot = $documents->recipe($request->input('engine'), $request->input('conditions'));
        $build = DB::transaction(function () use ($request, $membership, $snapshot, $documents): EngineBuild {
            $build = EngineBuild::query()->create([
                'company_id' => $membership->company_id, 'created_by_user_id' => $request->user()->id,
                'name' => $snapshot['engine']['name'], 'current_revision' => 1,
            ]);
            $build->revisions()->create([
                'created_by_user_id' => $request->user()->id, 'version' => 1, 'schema_version' => $snapshot['engine']['schemaVersion'],
                ...$snapshot, 'snapshot_hash' => $documents->hash($snapshot),
            ]);

            return $build;
        });

        return response()->json(['build' => $this->buildSummary($build, $request), 'revision' => $this->revisionDocument($build->revisions()->firstOrFail())], 201);
    }

    public function show(Request $request, EngineBuild $build): JsonResponse
    {
        $this->build($request, $build);
        $revision = $build->revisions()->where('version', $build->current_revision)->firstOrFail();

        return response()->json(['build' => $this->buildSummary($build, $request), 'revision' => $this->revisionDocument($revision)]);
    }

    public function revision(Request $request, EngineBuild $build, int $version): JsonResponse
    {
        $this->build($request, $build);
        $revision = $build->revisions()->where('version', $version)->firstOrFail();

        return response()->json(['build' => $this->buildSummary($build, $request), 'revision' => $this->revisionDocument($revision)]);
    }

    public function revise(Request $request, EngineBuild $build, BenchDocuments $documents): JsonResponse
    {
        $this->bounded($request);
        $this->build($request, $build, true);
        $data = $request->validate(['base_revision' => ['required', 'integer', 'min:1']]);
        $snapshot = $documents->recipe($request->input('engine'), $request->input('conditions'));
        $revision = DB::transaction(function () use ($request, $build, $data, $snapshot, $documents): EngineBuildRevision {
            $locked = EngineBuild::query()->lockForUpdate()->findOrFail($build->id);
            abort_if($locked->current_revision !== $data['base_revision'], 409, 'This build changed in another tab. Reload it before saving a new revision.');
            $revision = $locked->revisions()->create([
                'created_by_user_id' => $request->user()->id, 'version' => $locked->current_revision + 1,
                'schema_version' => $snapshot['engine']['schemaVersion'], ...$snapshot,
                'snapshot_hash' => $documents->hash($snapshot),
            ]);
            $locked->update(['current_revision' => $revision->version, 'name' => $snapshot['engine']['name']]);

            return $revision;
        });

        return response()->json(['build' => $this->buildSummary($build->refresh(), $request), 'revision' => $this->revisionDocument($revision)], 201);
    }

    private function runSummary(DynoRun $run): array
    {
        return [
            'uuid' => $run->uuid, 'name' => $run->engine['name'], 'build_uuid' => $run->revision->build->uuid,
            'revision' => $run->revision->version, 'status' => $run->status, 'reason' => $run->reason,
            'kind' => $run->procedure['kind'], 'sample_count' => $run->sample_count,
            'sample_bytes' => $run->sample_bytes, 'peak_power' => $run->peak_power, 'peak_torque' => $run->peak_torque,
            'created_at' => $run->created_at->toISOString(), 'verified' => false,
        ];
    }

    public function runs(Request $request): JsonResponse
    {
        $membership = $this->membership($request);
        $query = DynoRun::query()->where('company_id', $membership->company_id)->with('revision.build')->latest('id');
        if ($request->filled('build_uuid')) {
            $uuid = $request->string('build_uuid')->toString();
            $query->whereHas('revision.build', fn ($q) => $q->where('uuid', $uuid));
        }
        if ($request->filled('client_run_id')) {
            $request->validate(['client_run_id' => ['string', 'max:128']]);
            $query->where('client_run_id', $request->input('client_run_id'))->where('created_by_user_id', $request->user()->id);
        }
        $page = $query->paginate(20);

        return response()->json(['runs' => $page->getCollection()->map(fn ($r) => $this->runSummary($r)), 'page' => $page->currentPage(), 'last_page' => $page->lastPage()]);
    }

    public function saveRun(Request $request, BenchDocuments $documents): JsonResponse
    {
        $this->bounded($request);
        $membership = $this->membership($request);
        $request->validate(['build_uuid' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1']]);
        $build = EngineBuild::query()->where('uuid', $request->input('build_uuid'))->firstOrFail();
        $this->build($request, $build, true);
        $run = $documents->run($request->input('run'));
        $snapshotHash = $documents->hash(['engine' => $run['engine'], 'conditions' => $run['conditions']]);
        $revision = $build->revisions()->where('version', $request->input('revision'))->firstOrFail();
        if ($revision->snapshot_hash !== $snapshotHash) {
            throw ValidationException::withMessages(['revision' => 'The run must reference a saved revision with exactly its engine and conditions.']);
        }
        // Runs with a closed-throttle run-down keep it beside the samples;
        // earlier runs stored the samples array alone.
        $plain = json_encode(isset($run['rundown']) ? ['samples' => $run['samples'], 'rundown' => $run['rundown']] : $run['samples'], JSON_THROW_ON_ERROR);
        $compressed = gzencode($plain, 6);
        if ($compressed === false || strlen($compressed) > BenchDocuments::MAX_COMPRESSED_BYTES) {
            throw ValidationException::withMessages(['run.samples' => 'Compressed samples exceed the 256 KiB storage cap.']);
        }
        $submissionHash = $documents->hash($run);
        $stored = DB::transaction(function () use ($request, $membership, $revision, $run, $compressed, $submissionHash): DynoRun {
            User::query()->lockForUpdate()->findOrFail($request->user()->id);
            $existing = DynoRun::query()->where('company_id', $membership->company_id)->where('created_by_user_id', $request->user()->id)->where('client_run_id', $run['id'])->first();
            if ($existing !== null) {
                abort_if($existing->submission_hash !== $submissionHash || $existing->engine_build_revision_id !== $revision->id, 409, 'This run ID has already been saved with different content.');

                return $existing;
            }

            return DynoRun::query()->create([
                'company_id' => $membership->company_id, 'created_by_user_id' => $request->user()->id,
                'engine_build_revision_id' => $revision->id, 'client_run_id' => $run['id'],
                'schema_version' => $run['schemaVersion'], 'model_version' => $run['modelVersion'], 'runtime' => $run['runtime'],
                'engine' => $run['engine'], 'conditions' => $run['conditions'], 'procedure' => $run['procedure'],
                'status' => $run['status'], 'reason' => $run['reason'], 'warnings' => $run['warnings'],
                'sample_blob' => base64_encode($compressed), 'sample_bytes' => strlen($compressed),
                'sample_count' => count($run['samples']), 'peak_power' => count($run['samples']) ? max(array_column($run['samples'], 'power')) : null,
                'peak_torque' => count($run['samples']) ? max(array_column($run['samples'], 'torque')) : null,
                'submission_hash' => $submissionHash,
            ]);
        });

        return response()->json(['saved_run' => $this->runSummary($stored->load('revision.build'))], $stored->wasRecentlyCreated ? 201 : 200);
    }

    public function showRun(Request $request, DynoRun $run): JsonResponse
    {
        $membership = $this->membership($request);
        abort_unless($run->company_id === $membership->company_id, 404);
        $run->load('revision.build');

        return response()->json(['saved_run' => $this->runSummary($run), 'run' => $run->document()]);
    }
}
