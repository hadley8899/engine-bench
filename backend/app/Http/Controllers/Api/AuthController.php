<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\ResetPasswordRequest;
use App\Http\Resources\CompanyResource;
use App\Models\User;
use App\Services\Workspaces;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $user = DB::transaction(function () use ($request): User {
            $user = User::query()->create([
                'name' => $request->string('name')->toString(),
                'email' => $request->string('email')->toString(),
                'password' => $request->string('password')->toString(),
            ]);

            app(Workspaces::class)->ensurePersonal($user);

            return $user;
        });

        $user->sendEmailVerificationNotification();

        return response()->json([
            'message' => 'Registration successful. Check your inbox to verify your email.',
            'requires_verification' => true,
        ], Response::HTTP_CREATED);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::query()->where('email', $request->string('email')->toString())->first();

        if ($user === null || ! Hash::check($request->string('password')->toString(), $user->password)) {
            return response()->json([
                'message' => 'Invalid credentials.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        if (! $user->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Email verification is required before logging in.',
            ], Response::HTTP_FORBIDDEN);
        }

        $token = $user->refreshApiToken($request->ip(), $request->userAgent());
        $payload = $this->authPayload($user);

        return response()->json([
            'message' => 'Login successful.',
            ...$payload,
            'token' => $token,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->attributes->get('api_session')?->delete();

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        $status = Password::sendResetLink($request->only('email'));

        if ($status !== Password::RESET_LINK_SENT) {
            return response()->json([
                'message' => __($status),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'message' => __($status),
        ]);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();

                $user->apiSessions()->delete();

                if (! $user->hasVerifiedEmail()) {
                    $user->markEmailAsVerified();
                }
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'message' => __($status),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'message' => __($status),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $payload = $this->authPayload($user);

        return response()->json([
            ...$payload,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function authPayload(User $user): array
    {
        app(Workspaces::class)->ensurePersonal($user);
        $companyUser = $user->currentCompanyUser();

        return [
            'user' => $user,
            'company' => $companyUser?->company ? new CompanyResource($companyUser->company) : null,
            'role' => $companyUser?->role,
        ];
    }
}
