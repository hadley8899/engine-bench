<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CompanySetupRequest;
use App\Http\Resources\CompanyResource;
use App\Models\Company;
use App\Models\User;
use App\Services\Workspaces;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkspaceController extends Controller
{
    public function index(Request $request, Workspaces $workspaces): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $workspaces->ensurePersonal($user);

        return response()->json(['workspaces' => $user->companyUsers()->with('company')->orderBy('id')->get()->map(fn ($membership) => [
            ...((new CompanyResource($membership->company))->resolve()),
            'role' => $membership->role, 'active' => $membership->company_id === $user->active_company_id,
        ])]);
    }

    public function store(CompanySetupRequest $request, Workspaces $workspaces): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $company = $workspaces->createTeam($user, $request->string('name')->toString());

        return response()->json(['workspace' => new CompanyResource($company)], 201);
    }

    public function activate(Request $request, Company $company): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless($user->companyUsers()->where('company_id', $company->id)->exists(), 404);
        $user->forceFill(['active_company_id' => $company->id])->save();

        return response()->json(['workspace' => new CompanyResource($company)]);
    }
}
