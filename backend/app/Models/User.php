<?php

namespace App\Models;

use App\Traits\HasUuid;
use Database\Factories\UserFactory;
use Illuminate\Auth\MustVerifyEmail as MustVerifyEmailTrait;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasUuid, MustVerifyEmailTrait, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'id',
        'active_company_id',
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function refreshApiToken(?string $ipAddress = null, ?string $userAgent = null): string
    {
        $plainToken = Str::random(64);

        $this->apiSessions()->where('expires_at', '<=', now())->delete();

        $this->apiSessions()->create([
            'token_hash' => hash('sha256', $plainToken),
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'last_used_at' => now(),
            'expires_at' => ApiSession::newExpiration(),
        ]);

        $sessionIdsToKeep = $this->apiSessions()
            ->latest('last_used_at')
            ->latest('id')
            ->limit(max(1, (int) config('auth.max_api_sessions_per_user', 100)))
            ->pluck('id');

        $this->apiSessions()->whereNotIn('id', $sessionIdsToKeep)->delete();

        return $plainToken;
    }

    public function clearApiToken(): void
    {
        $this->apiSessions()->delete();
    }

    public function apiSessions(): HasMany
    {
        return $this->hasMany(ApiSession::class);
    }

    public function companyUsers(): HasMany
    {
        return $this->hasMany(CompanyUser::class);
    }

    public function currentCompanyUser(): ?CompanyUser
    {
        $query = $this->companyUsers()->with('company');
        if ($this->active_company_id !== null) {
            $selected = (clone $query)->where('company_id', $this->active_company_id)->first();
            if ($selected !== null) {
                return $selected;
            }
        }

        return $query->orderBy('id')->first();
    }
}
