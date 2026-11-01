<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCompanyUserRequest;
use App\Http\Requests\UpdateCompanyUserRequest;
use App\Http\Resources\CompanyUserResource;
use App\Mail\UserInviteEmail;
use App\Models\CompanyUser;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class CompanyUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $companyUser = $request->user()?->currentCompanyUser();

        if ($companyUser === null) {
            return response()->json([
                'message' => 'Company setup is required.',
            ], Response::HTTP_CONFLICT);
        }

        $users = CompanyUser::query()
            ->with('user')
            ->where('company_id', $companyUser->company_id)
            ->get();

        return response()->json([
            'users' => CompanyUserResource::collection($users)->resolve(),
        ]);
    }

    public function store(StoreCompanyUserRequest $request): JsonResponse
    {
        $companyUser = $this->requireAdmin($request);
        if (! $companyUser instanceof CompanyUser) {
            return $companyUser;
        }

        $email = $request->string('email')->toString();
        $user = User::query()->where('email', $email)->first();
        $wasCreated = false;

        if ($user === null) {
            $user = User::query()->create([
                'name' => $request->string('name')->toString(),
                'email' => $email,
                'password' => Str::random(32),
            ]);
            $wasCreated = true;
        }

        $existing = CompanyUser::query()
            ->where('company_id', $companyUser->company_id)
            ->where('user_id', $user->id)
            ->first();

        if ($existing !== null) {
            return response()->json([
                'message' => 'User already belongs to this company.',
            ], Response::HTTP_CONFLICT);
        }

        $membership = CompanyUser::query()->create([
            'company_id' => $companyUser->company_id,
            'user_id' => $user->id,
            'role' => $request->string('role')->toString(),
        ]);

        if ($wasCreated) {
            $verificationUrl = URL::temporarySignedRoute(
                'verification.verify',
                now()->addMinutes((int) config('auth.verification.expire', 60)),
                [
                    'id' => $user->getKey(),
                    'hash' => sha1($user->getEmailForVerification()),
                ],
            );
            $token = Password::createToken($user);
            $frontendUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');
            $resetUrl = $frontendUrl.'/reset-password?token='.$token.'&email='.urlencode($user->email);

            try {
                Mail::to($user->email)->send(new UserInviteEmail($user, $verificationUrl, $resetUrl));
            } catch (\Throwable $exception) {
                Log::warning('Failed to send invite email.', [
                    'user_id' => $user->id,
                    'error' => $exception->getMessage(),
                ]);
            }
        }

        return response()->json([
            'user' => new CompanyUserResource($membership->load('user')),
        ], Response::HTTP_CREATED);
    }

    public function update(UpdateCompanyUserRequest $request, CompanyUser $companyUser): JsonResponse
    {
        $current = $this->requireAdmin($request);
        if (! $current instanceof CompanyUser) {
            return $current;
        }

        if ($companyUser->company_id !== $current->company_id) {
            abort(Response::HTTP_NOT_FOUND);
        }

        $nextRole = $request->input('role');

        if ($nextRole && $companyUser->role === CompanyUser::ROLE_ADMIN && $nextRole !== CompanyUser::ROLE_ADMIN) {
            $adminCount = CompanyUser::query()
                ->where('company_id', $current->company_id)
                ->where('role', CompanyUser::ROLE_ADMIN)
                ->count();

            if ($adminCount <= 1) {
                return response()->json([
                    'message' => 'At least one admin is required.',
                ], Response::HTTP_UNPROCESSABLE_ENTITY);
            }
        }

        if ($companyUser->user_id !== $current->user_id && (($request->filled('name') && $request->input('name') !== $companyUser->user->name) || ($request->filled('email') && $request->input('email') !== $companyUser->user->email))) {
            return response()->json(['message' => 'Members manage their own account details. Administrators can change workspace roles.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if ($request->filled('name') || $request->filled('email')) {
            $companyUser->user->update([
                'name' => $request->string('name')->toString() ?: $companyUser->user->name,
                'email' => $request->string('email')->toString() ?: $companyUser->user->email,
            ]);
        }

        if ($nextRole) {
            $companyUser->update([
                'role' => $nextRole,
            ]);
        }

        return response()->json([
            'user' => new CompanyUserResource($companyUser->load('user')),
        ]);
    }

    public function destroy(Request $request, CompanyUser $companyUser): JsonResponse
    {
        $current = $this->requireAdmin($request);
        if (! $current instanceof CompanyUser) {
            return $current;
        }

        if ($companyUser->company_id !== $current->company_id) {
            abort(Response::HTTP_NOT_FOUND);
        }

        if ($companyUser->user_id === $current->user_id) {
            return response()->json([
                'message' => 'You cannot remove yourself.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if ($companyUser->role === CompanyUser::ROLE_ADMIN) {
            $adminCount = CompanyUser::query()
                ->where('company_id', $current->company_id)
                ->where('role', CompanyUser::ROLE_ADMIN)
                ->count();

            if ($adminCount <= 1) {
                return response()->json([
                    'message' => 'At least one admin is required.',
                ], Response::HTTP_UNPROCESSABLE_ENTITY);
            }
        }

        $companyUser->delete();

        return response()->json([
            'message' => 'User removed.',
        ]);
    }

    private function requireAdmin(Request $request): CompanyUser|JsonResponse
    {
        $companyUser = $request->user()?->currentCompanyUser();

        if ($companyUser === null) {
            return response()->json([
                'message' => 'Company setup is required.',
            ], Response::HTTP_CONFLICT);
        }

        if (! $companyUser->isAdmin()) {
            return response()->json([
                'message' => 'Admin access required.',
            ], Response::HTTP_FORBIDDEN);
        }

        if ($companyUser->company->personal_owner_id !== null) {
            return response()->json(['message' => 'Personal workspaces are private. Create a team workspace to invite members.'], Response::HTTP_CONFLICT);
        }

        return $companyUser;
    }
}
