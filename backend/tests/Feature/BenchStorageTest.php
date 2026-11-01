<?php

use App\Models\CompanyUser;
use App\Models\DynoRun;
use App\Models\EngineBuild;
use App\Models\EngineBuildRevision;
use App\Models\User;
use Illuminate\Support\Facades\Notification;

function benchFixture(): array
{
    return json_decode(file_get_contents(__DIR__.'/../Fixtures/road-run.json'), true, 512, JSON_THROW_ON_ERROR);
}

function benchRecipe(): array
{
    $run = benchFixture();

    return ['engine' => $run['engine'], 'conditions' => $run['conditions']];
}

it('requires authentication for build and run storage', function () {
    $this->getJson('/api/auth/builds')->assertUnauthorized();
    $this->postJson('/api/auth/builds', benchRecipe())->assertUnauthorized();
    $this->getJson('/api/auth/runs')->assertUnauthorized();
    $this->postJson('/api/auth/runs', [])->assertUnauthorized();
});

it('creates a personal workspace at registration without allowing invitations into it', function () {
    Notification::fake();
    $this->postJson('/api/auth/register', ['name' => 'Personal User', 'email' => 'personal@example.test', 'password' => 'password123', 'password_confirmation' => 'password123'])->assertCreated();
    $user = User::query()->where('email', 'personal@example.test')->firstOrFail();
    expect($user->currentCompanyUser()->company->personal_owner_id)->toBe($user->id);
    $token = $user->refreshApiToken();
    $this->withToken($token)->getJson('/api/auth/workspaces')->assertOk()->assertJsonPath('workspaces.0.kind', 'personal')->assertJsonPath('workspaces.0.active', true);
    $this->withToken($token)->postJson('/api/auth/company/users', ['name' => 'Another', 'email' => 'another@example.test', 'role' => 'admin'])->assertConflict();
});

it('creates and selects team workspaces while keeping personal data private', function () {
    $user = User::factory()->create();
    $token = $user->refreshApiToken();
    $personal = $this->withToken($token)->getJson('/api/auth/workspaces')->assertOk()->json('workspaces.0.uuid');
    $build = $this->withToken($token)->postJson('/api/auth/builds', benchRecipe())->assertCreated()->json('build.uuid');
    $team = $this->withToken($token)->postJson('/api/auth/workspaces', ['name' => 'Engine Team'])->assertCreated()->json('workspace.uuid');
    $this->withToken($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('company.uuid', $team);
    $this->withToken($token)->getJson('/api/auth/builds/'.$build)->assertNotFound();
    $this->withToken($token)->postJson('/api/auth/workspaces/'.$personal.'/activate')->assertOk();
    $this->withToken($token)->getJson('/api/auth/builds/'.$build)->assertOk();
    $other = User::factory()->create();
    $otherToken = $other->refreshApiToken();
    $this->withToken($otherToken)->postJson('/api/auth/workspaces/'.$team.'/activate')->assertNotFound();
});

it('validates stored documents using the exported schemas', function () {
    [, , $token] = createAuthenticatedCompanyUser();
    $bad = benchRecipe();
    $bad['engine']['bore'] = '0.086';
    $this->withToken($token)->postJson('/api/auth/builds', $bad)->assertUnprocessable()->assertJsonValidationErrors('engine');
    $bad = benchRecipe();
    $bad['engine']['unknownField'] = true;
    $this->withToken($token)->postJson('/api/auth/builds', $bad)->assertUnprocessable();
    $bad = benchRecipe();
    $bad['conditions']['oxygen'] = .99;
    $this->withToken($token)->postJson('/api/auth/builds', $bad)->assertUnprocessable();
    expect(EngineBuild::query()->count())->toBe(0);
});

it('preserves old build revisions and rejects stale concurrent saves', function () {
    [, , $token] = createAuthenticatedCompanyUser();
    $original = benchRecipe();
    $saved = $this->withToken($token)->postJson('/api/auth/builds', $original)->assertCreated()->json();
    $uuid = $saved['build']['uuid'];
    $changed = $original;
    $changed['engine']['bore'] = .09;
    $changed['engine']['name'] = 'Changed build';
    $this->withToken($token)->postJson('/api/auth/builds/'.$uuid.'/revisions', ['base_revision' => 1, ...$changed])->assertCreated()->assertJsonPath('revision.version', 2);
    $this->withToken($token)->getJson('/api/auth/builds/'.$uuid.'/revisions/1')->assertOk()->assertJsonPath('revision.engine', fn ($value) => $value == $original['engine']);
    $this->withToken($token)->getJson('/api/auth/builds/'.$uuid)->assertOk()->assertJsonPath('revision.engine.bore', .09);
    $this->withToken($token)->postJson('/api/auth/builds/'.$uuid.'/revisions', ['base_revision' => 1, ...$changed])->assertConflict();
    expect(EngineBuildRevision::query()->count())->toBe(2);
});

it('scopes all build and run paths to the current workspace and ignores forged workspace ownership', function () {
    [$owner, $company, $token] = createAuthenticatedCompanyUser();
    [$other, $otherCompany, $otherToken] = createAuthenticatedCompanyUser();
    $uuid = $this->withToken($token)->postJson('/api/auth/builds', ['company_id' => $otherCompany->id, 'created_by_user_id' => $other->id, ...benchRecipe()])->assertCreated()->json('build.uuid');
    $build = EngineBuild::query()->where('uuid', $uuid)->firstOrFail();
    expect($build->company_id)->toBe($company->id);
    expect($build->created_by_user_id)->toBe($owner->id);
    $saved = $this->withToken($token)->postJson('/api/auth/runs', ['build_uuid' => $uuid, 'revision' => 1, 'run' => benchFixture()])->assertCreated()->json('saved_run.uuid');
    $this->withToken($otherToken)->getJson('/api/auth/builds/'.$uuid)->assertNotFound();
    $this->withToken($otherToken)->getJson('/api/auth/builds/'.$uuid.'/revisions/1')->assertNotFound();
    $this->withToken($otherToken)->postJson('/api/auth/builds/'.$uuid.'/revisions', ['base_revision' => 1, ...benchRecipe()])->assertNotFound();
    $this->withToken($otherToken)->postJson('/api/auth/runs', ['build_uuid' => $uuid, 'revision' => 1, 'run' => benchFixture()])->assertNotFound();
    $this->withToken($otherToken)->getJson('/api/auth/runs/'.$saved)->assertNotFound();
    $this->withToken($otherToken)->getJson('/api/auth/builds')->assertOk()->assertJsonCount(0, 'builds');
    $this->withToken($otherToken)->getJson('/api/auth/runs')->assertOk()->assertJsonCount(0, 'runs');
});

it('allows members to save their own work but reserves editing others builds for administrators', function () {
    [$owner, $company, $token] = createAuthenticatedCompanyUser(CompanyUser::ROLE_USER);
    $uuid = $this->withToken($token)->postJson('/api/auth/builds', benchRecipe())->assertCreated()->json('build.uuid');
    $peer = User::factory()->create();
    $admin = User::factory()->create();
    foreach ([[$peer, 'user'], [$admin, 'admin']] as [$user, $role]) {
        CompanyUser::factory()->create(['company_id' => $company->id, 'user_id' => $user->id, 'role' => $role]);
    }
    $peerToken = $peer->refreshApiToken();
    $adminToken = $admin->refreshApiToken();
    $this->withToken($peerToken)->getJson('/api/auth/builds/'.$uuid)->assertOk()->assertJsonPath('build.can_write', false);
    $this->withToken($peerToken)->postJson('/api/auth/builds/'.$uuid.'/revisions', ['base_revision' => 1, ...benchRecipe()])->assertForbidden();
    $this->withToken($peerToken)->postJson('/api/auth/runs', ['build_uuid' => $uuid, 'revision' => 1, 'run' => benchFixture()])->assertForbidden();
    $this->withToken($adminToken)->postJson('/api/auth/builds/'.$uuid.'/revisions', ['base_revision' => 1, ...benchRecipe()])->assertCreated();
    $this->withToken($adminToken)->patchJson('/api/auth/company/users/'.$owner->currentCompanyUser()->uuid, ['email' => 'taken@example.test'])->assertUnprocessable();
});

it('round trips compressed samples exactly and leaves saved runs unchanged after build edits', function () {
    [, , $token] = createAuthenticatedCompanyUser();
    $uuid = $this->withToken($token)->postJson('/api/auth/builds', benchRecipe())->assertCreated()->json('build.uuid');
    $fixture = benchFixture();
    $runUuid = $this->withToken($token)->postJson('/api/auth/runs', ['build_uuid' => $uuid, 'revision' => 1, 'run' => $fixture])->assertCreated()->assertJsonPath('saved_run.verified', false)->json('saved_run.uuid');
    $row = DynoRun::query()->where('uuid', $runUuid)->firstOrFail();
    expect($row->sample_bytes)->toBeLessThan(strlen(json_encode($fixture['samples'])));
    expect($row->document())->toEqual($fixture);
    $bytes = $row->sample_blob;
    $updated = benchRecipe();
    $updated['engine']['bore'] = .088;
    $this->withToken($token)->postJson('/api/auth/builds/'.$uuid.'/revisions', ['base_revision' => 1, ...$updated])->assertCreated();
    $this->withToken($token)->getJson('/api/auth/runs/'.$runUuid)->assertOk()->assertJsonPath('run.samples', $fixture['samples'])->assertJsonPath('run.engine', fn ($value) => $value == $fixture['engine'])->assertJsonPath('saved_run.revision', 1);
    expect($row->fresh()->sample_blob)->toBe($bytes);
    $this->withToken($token)->patchJson('/api/auth/runs/'.$runUuid, ['run' => $fixture])->assertStatus(405);
});

it('makes retries idempotent and rejects reused IDs with different content', function () {
    [, , $token] = createAuthenticatedCompanyUser();
    $uuid = $this->withToken($token)->postJson('/api/auth/builds', benchRecipe())->assertCreated()->json('build.uuid');
    $payload = ['build_uuid' => $uuid, 'revision' => 1, 'run' => benchFixture()];
    $first = $this->withToken($token)->postJson('/api/auth/runs', $payload)->assertCreated()->json('saved_run.uuid');
    $this->withToken($token)->postJson('/api/auth/runs', $payload)->assertOk()->assertJsonPath('saved_run.uuid', $first);
    $this->withToken($token)->getJson('/api/auth/runs?client_run_id=storage-fixture')->assertOk()->assertJsonCount(1, 'runs')->assertJsonPath('runs.0.uuid', $first);
    $this->withToken($token)->getJson('/api/auth/runs?client_run_id=unknown')->assertOk()->assertJsonCount(0, 'runs');
    [, , $otherToken] = createAuthenticatedCompanyUser();
    $this->withToken($otherToken)->getJson('/api/auth/runs?client_run_id=storage-fixture')->assertOk()->assertJsonCount(0, 'runs');
    $payload['run']['reason'] = 'different';
    $this->withToken($token)->postJson('/api/auth/runs', $payload)->assertConflict();
    expect(DynoRun::query()->count())->toBe(1);
});

it('rejects snapshot mismatch, active runs, unknown models and inconsistent sample units', function () {
    [, , $token] = createAuthenticatedCompanyUser();
    $uuid = $this->withToken($token)->postJson('/api/auth/builds', benchRecipe())->assertCreated()->json('build.uuid');
    foreach (['snapshot', 'active', 'model', 'units', 'ordering', 'samples'] as $bad) {
        $run = benchFixture();
        if ($bad === 'snapshot') {
            $run['engine']['bore'] = .09;
        }
        if ($bad === 'active') {
            $run['status'] = 'running';
        }
        if ($bad === 'model') {
            $run['modelVersion'] = 'not-supported';
        }
        if ($bad === 'units') {
            $run['samples'][0]['power'] = 999;
        }
        if ($bad === 'ordering') {
            $run['samples'][1]['time'] = 0;
        }
        if ($bad === 'samples') {
            $run['samples'] = array_fill(0, 5001, $run['samples'][0]);
        }
        $this->withToken($token)->postJson('/api/auth/runs', ['build_uuid' => $uuid, 'revision' => 1, 'run' => $run])->assertUnprocessable();
    }
    expect(DynoRun::query()->count())->toBe(0);
});

it('bounds request size and preserves partial aborted runs', function () {
    [, , $token] = createAuthenticatedCompanyUser();
    $large = benchRecipe();
    $large['padding'] = str_repeat('x', 1048576);
    $this->withToken($token)->postJson('/api/auth/builds', $large)->assertStatus(413);
    $uuid = $this->withToken($token)->postJson('/api/auth/builds', benchRecipe())->assertCreated()->json('build.uuid');
    $run = benchFixture();
    $run['status'] = 'aborted';
    $run['reason'] = 'Emergency stop';
    $run['samples'] = array_slice($run['samples'], 0, 2);
    $this->withToken($token)->postJson('/api/auth/runs', ['build_uuid' => $uuid, 'revision' => 1, 'run' => $run])->assertCreated()->assertJsonPath('saved_run.status', 'aborted')->assertJsonPath('saved_run.sample_count', 2);
});

it('rejects a stale workspace hint rather than saving into a newly selected workspace', function () {
    [, , $token] = createAuthenticatedCompanyUser();
    $this->withToken($token)->withHeader('X-Workspace-UUID', 'stale-workspace')->postJson('/api/auth/builds', benchRecipe())->assertConflict();
    expect(EngineBuild::query()->count())->toBe(0);
});
