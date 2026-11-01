<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CompanySetupRequest;
use App\Http\Requests\UpdateCompanyRequest;
use App\Http\Resources\CompanyResource;
use App\Models\CompanyUser;
use App\Models\User;
use App\Services\Workspaces;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CompanyController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $companyUser = $request->user()?->currentCompanyUser();

        if ($companyUser === null) {
            return response()->json([
                'message' => 'Company setup is required.',
            ], Response::HTTP_CONFLICT);
        }

        return response()->json([
            'company' => new CompanyResource($companyUser->company),
            'role' => $companyUser->role,
        ]);
    }

    public function setup(CompanySetupRequest $request): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        if ($user->currentCompanyUser() !== null && $user->currentCompanyUser()->company->personal_owner_id === null) {
            return response()->json([
                'message' => 'Company already exists.',
            ], Response::HTTP_CONFLICT);
        }

        $company = app(Workspaces::class)->createTeam($user, $request->string('name')->toString());

        return response()->json([
            'company' => new CompanyResource($company),
            'role' => CompanyUser::ROLE_ADMIN,
        ], Response::HTTP_CREATED);
    }

    public function update(UpdateCompanyRequest $request): JsonResponse
    {
        $companyUser = $this->requireAdmin($request);
        if (! $companyUser instanceof CompanyUser) {
            return $companyUser;
        }

        $company = $companyUser->company;
        $company->update([
            'name' => $request->string('name')->toString(),
        ]);

        return response()->json([
            'company' => new CompanyResource($company->refresh()),
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

        return $companyUser;
    }
}
