<?php

use App\Models\User;
use Carbon\CarbonImmutable;

it('keeps multiple login sessions active for the same user', function () {
    $user = User::factory()->create(['password' => 'password']);

    $firstLogin = $this->withHeader('User-Agent', 'First Browser')
        ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
        ->assertOk();
    $secondLogin = $this->withHeader('User-Agent', 'Second Browser')
        ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
        ->assertOk();

    $firstToken = $firstLogin->json('token');
    $secondToken = $secondLogin->json('token');

    expect($firstToken)->not->toBe($secondToken);
    expect($user->apiSessions()->count())->toBe(2);

    $this->withToken($firstToken)->getJson('/api/auth/me')->assertOk();
    $this->withToken($secondToken)->getJson('/api/auth/me')->assertOk();
});

it('logs out only the current session', function () {
    $user = User::factory()->create();
    $firstToken = $user->refreshApiToken();
    $secondToken = $user->refreshApiToken();

    $this->withToken($firstToken)->postJson('/api/auth/logout')->assertOk();

    $this->withToken($firstToken)->getJson('/api/auth/me')->assertUnauthorized();
    $this->withToken($secondToken)->getJson('/api/auth/me')->assertOk();
    expect($user->apiSessions()->count())->toBe(1);
});

it('lists and revokes account sessions', function () {
    $user = User::factory()->create();
    $currentToken = $user->refreshApiToken('192.0.2.1', 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0');
    $otherToken = $user->refreshApiToken('192.0.2.2', 'Mozilla/5.0 (Macintosh) Safari/605.1');
    $otherSession = $user->apiSessions()->where('ip_address', '192.0.2.2')->firstOrFail();

    $this->withToken($currentToken)
        ->getJson('/api/auth/sessions')
        ->assertOk()
        ->assertJsonCount(2, 'sessions')
        ->assertJsonFragment([
            'display_name' => 'Chrome on Windows',
            'ip_address' => '192.0.2.1',
            'is_current' => true,
        ]);

    $this->withToken($currentToken)
        ->deleteJson('/api/auth/sessions/'.$otherSession->uuid)
        ->assertOk()
        ->assertJsonPath('signed_out_current_session', false);

    $this->withToken($otherToken)->getJson('/api/auth/me')->assertUnauthorized();
    $this->withToken($currentToken)->getJson('/api/auth/me')->assertOk();
});

it('can sign out every session for the account', function () {
    $user = User::factory()->create();
    $currentToken = $user->refreshApiToken();
    $otherToken = $user->refreshApiToken();

    $this->withToken($currentToken)
        ->deleteJson('/api/auth/sessions')
        ->assertOk()
        ->assertJsonPath('signed_out_sessions', 2);

    $this->withToken($currentToken)->getJson('/api/auth/me')->assertUnauthorized();
    $this->withToken($otherToken)->getJson('/api/auth/me')->assertUnauthorized();
});

it('does not allow revoking another users session', function () {
    $user = User::factory()->create();
    $token = $user->refreshApiToken();
    $otherSession = User::factory()->create()->apiSessions()->create([
        'token_hash' => hash('sha256', 'another-token'),
        'last_used_at' => now(),
        'expires_at' => now()->addDays(180),
    ]);

    $this->withToken($token)
        ->deleteJson('/api/auth/sessions/'.$otherSession->uuid)
        ->assertNotFound();

    expect($otherSession->fresh())->not->toBeNull();
});

it('extends idle expiry whenever a session is used', function () {
    config()->set('auth.api_session_idle_timeout_days', 180);
    $this->travelTo(CarbonImmutable::parse('2026-01-01 12:00:00'));

    $user = User::factory()->create();
    $token = $user->refreshApiToken();
    $initialExpiry = $user->apiSessions()->firstOrFail()->expires_at;

    $this->travel(179)->days();
    $this->withToken($token)->getJson('/api/auth/me')->assertOk();

    $session = $user->apiSessions()->firstOrFail()->fresh();
    expect($session->last_used_at->equalTo(now()))->toBeTrue();
    expect($session->expires_at->greaterThan($initialExpiry))->toBeTrue();

    $this->travel(181)->days();
    $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    expect($user->apiSessions()->count())->toBe(0);

    $this->travelBack();
});

it('caps the number of active sessions retained for a user', function () {
    config()->set('auth.max_api_sessions_per_user', 2);

    $user = User::factory()->create();
    $firstToken = $user->refreshApiToken();
    $secondToken = $user->refreshApiToken();
    $thirdToken = $user->refreshApiToken();

    expect($user->apiSessions()->count())->toBe(2);
    $this->withToken($firstToken)->getJson('/api/auth/me')->assertUnauthorized();
    $this->withToken($secondToken)->getJson('/api/auth/me')->assertOk();
    $this->withToken($thirdToken)->getJson('/api/auth/me')->assertOk();
});
