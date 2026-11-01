<?php

namespace App\Services;

use App\Models\Company;
use App\Models\CompanyUser;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Workspaces
{
    public function ensurePersonal(User $user): Company
    {
        return DB::transaction(function () use ($user): Company {
            $locked = User::query()->lockForUpdate()->findOrFail($user->id);
            $previous = $locked->currentCompanyUser();
            $personal = Company::query()->firstOrCreate(['personal_owner_id' => $user->id], [
                'name' => Str::limit($user->name, 230, '')."'s workspace",
                'slug' => 'personal-'.Str::uuid(),
            ]);
            CompanyUser::query()->firstOrCreate(['company_id' => $personal->id, 'user_id' => $user->id], [
                'role' => CompanyUser::ROLE_ADMIN,
            ]);
            if ($previous === null || $locked->active_company_id === null) {
                $locked->forceFill(['active_company_id' => $previous?->company_id ?? $personal->id])->save();
            }
            $user->active_company_id = $locked->active_company_id;

            return $personal;
        });
    }

    public function createTeam(User $user, string $name): Company
    {
        return DB::transaction(function () use ($user, $name): Company {
            $company = Company::query()->create(['name' => $name, 'slug' => Str::slug($name).'-'.Str::uuid()]);
            CompanyUser::query()->create(['company_id' => $company->id, 'user_id' => $user->id, 'role' => CompanyUser::ROLE_ADMIN]);
            $user->forceFill(['active_company_id' => $company->id])->save();

            return $company;
        });
    }
}
