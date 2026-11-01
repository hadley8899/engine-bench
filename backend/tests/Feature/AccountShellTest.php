<?php

use App\Mail\UserInviteEmail;
use App\Mail\WelcomeEmail;
use App\Models\CompanyUser;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

it('registers an account and requires email verification', function () {
    Notification::fake();
    $this->postJson('/api/auth/register', [
        'name' => 'New User', 'email' => 'new@example.test',
        'password' => 'password123', 'password_confirmation' => 'password123',
    ])->assertCreated()->assertJsonPath('requires_verification', true);

    $user = User::query()->where('email', 'new@example.test')->firstOrFail();
    Notification::assertSentTo($user, VerifyEmail::class);
    expect($user->email_verified_at)->toBeNull();
    expect(Hash::check('password123', $user->password))->toBeTrue();
    $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password123'])->assertForbidden();
});

it('rejects duplicate registration and incorrect credentials', function () {
    $user = User::factory()->create();
    $this->postJson('/api/auth/register', [
        'name' => 'Duplicate', 'email' => $user->email,
        'password' => 'password123', 'password_confirmation' => 'password123',
    ])->assertUnprocessable()->assertJsonValidationErrors('email');
    $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'incorrect'])->assertUnauthorized();
});

it('verifies a signed email link and sends a welcome email', function () {
    Mail::fake();
    $user = User::factory()->unverified()->create();
    $url = URL::temporarySignedRoute('verification.verify', now()->addMinutes(60), [
        'id' => $user->id, 'hash' => sha1($user->email),
    ]);
    $this->get($url)->assertRedirect(rtrim(config('app.frontend_url'), '/').'/login');
    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
    Mail::assertSent(WelcomeEmail::class);
    $this->get($url.'&tampered=1')->assertForbidden();
});

it('sends a password reset notification', function () {
    Notification::fake();
    $user = User::factory()->create();
    $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk();
    Notification::assertSentTo($user, ResetPassword::class);
});

it('resets a password and revokes existing sessions', function () {
    $user = User::factory()->create();
    $sessionToken = $user->refreshApiToken();
    $resetToken = Password::createToken($user);
    $this->postJson('/api/auth/reset-password', [
        'email' => $user->email, 'token' => $resetToken,
        'password' => 'replacement123', 'password_confirmation' => 'replacement123',
    ])->assertOk();
    expect(Hash::check('replacement123', $user->fresh()->password))->toBeTrue();
    $this->withToken($sessionToken)->getJson('/api/auth/me')->assertUnauthorized();
});

it('requires authentication for account and company endpoints', function () {
    foreach (['me', 'sessions', 'company', 'company/users', 'notifications'] as $path) {
        $this->getJson('/api/auth/'.$path)->assertUnauthorized();
    }
});

it('creates a workspace with its owner as an administrator', function () {
    $user = User::factory()->create();
    $token = $user->refreshApiToken();
    $this->withToken($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('company.kind', 'personal');
    $this->withToken($token)->postJson('/api/auth/company/setup', ['name' => 'My Workspace'])
        ->assertCreated()->assertJsonPath('company.name', 'My Workspace')->assertJsonPath('role', 'admin');
    $this->withToken($token)->getJson('/api/auth/company/users')->assertOk()->assertJsonCount(1, 'users');
    $this->withToken($token)->postJson('/api/auth/company/setup', ['name' => 'Another'])->assertConflict();
});

it('allows administrators to invite users and protects the last administrator', function () {
    Mail::fake();
    [$user, $company, $token] = createAuthenticatedCompanyUser();
    $this->withToken($token)->postJson('/api/auth/company/users', [
        'name' => 'Invited User', 'email' => 'invited@example.test', 'role' => 'user',
    ])->assertCreated();
    Mail::assertSent(UserInviteEmail::class);
    $membership = CompanyUser::query()->where('user_id', $user->id)->firstOrFail();
    $this->withToken($token)->patchJson('/api/auth/company/users/'.$membership->uuid, ['role' => 'user'])
        ->assertUnprocessable();
    $this->withToken($token)->deleteJson('/api/auth/company/users/'.$membership->uuid)->assertUnprocessable();
});

it('prevents ordinary members from administering users or the workspace', function () {
    [, , $token] = createAuthenticatedCompanyUser(CompanyUser::ROLE_USER);
    $this->withToken($token)->postJson('/api/auth/company/users', [
        'name' => 'Someone', 'email' => 'someone@example.test', 'role' => 'admin',
    ])->assertForbidden();
    $this->withToken($token)->patchJson('/api/auth/company', ['name' => 'Changed'])->assertForbidden();
});

it('does not allow one workspace administrator to change another workspace membership', function () {
    [, , $token] = createAuthenticatedCompanyUser();
    [$otherUser] = createAuthenticatedCompanyUser();
    $otherMembership = CompanyUser::query()->where('user_id', $otherUser->id)->firstOrFail();
    $this->withToken($token)->patchJson('/api/auth/company/users/'.$otherMembership->uuid, ['name' => 'Changed'])->assertNotFound();
    $this->withToken($token)->deleteJson('/api/auth/company/users/'.$otherMembership->uuid)->assertNotFound();
});

it('keeps notifications scoped to their owner', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $notification = $other->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => 'example', 'data' => ['title' => 'Private'],
    ]);
    $token = $user->refreshApiToken();
    $this->withToken($token)->getJson('/api/auth/notifications')->assertOk()->assertJsonCount(0, 'notifications');
    $this->withToken($token)->patchJson('/api/auth/notifications/'.$notification->id)->assertNotFound();
});

it('seeds a reusable demo workspace without duplicating accounts', function () {
    $this->seed();
    $this->seed();
    expect(User::query()->where('email', 'admin@example.test')->count())->toBe(1);
    expect(CompanyUser::query()->count())->toBe(1);
    $this->postJson('/api/auth/login', ['email' => 'admin@example.test', 'password' => 'password'])
        ->assertOk()->assertJsonPath('role', 'admin')->assertJsonPath('company.name', 'Demo Workspace');
});
