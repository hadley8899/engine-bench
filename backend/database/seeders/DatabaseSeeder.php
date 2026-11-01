<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\CompanyUser;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            return;
        }

        $user = User::query()->firstOrCreate(['email' => 'admin@example.test'], [
            'name' => 'Demo Admin',
            'password' => 'password',
            'email_verified_at' => now(),
        ]);
        $company = Company::query()->firstOrCreate(['slug' => 'demo-workspace'], ['name' => 'Demo Workspace']);
        CompanyUser::query()->firstOrCreate(['company_id' => $company->id, 'user_id' => $user->id], [
            'role' => CompanyUser::ROLE_ADMIN,
        ]);
    }
}
