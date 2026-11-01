<?php

namespace App\Models;

use App\Traits\HasUuid;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApiSession extends Model
{
    use HasUuid;

    protected $fillable = [
        'uuid',
        'user_id',
        'token_hash',
        'ip_address',
        'user_agent',
        'last_used_at',
        'expires_at',
    ];

    protected $hidden = [
        'id',
        'token_hash',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public static function fromPlainToken(?string $plainToken): ?self
    {
        if (! is_string($plainToken) || trim($plainToken) === '') {
            return null;
        }

        $session = self::query()
            ->with('user')
            ->where('token_hash', hash('sha256', trim($plainToken)))
            ->first();

        if (! $session instanceof self) {
            return null;
        }

        if ($session->expires_at === null || $session->expires_at->lte(now())) {
            $session->delete();

            return null;
        }

        $session->markUsed();

        return $session;
    }

    public static function userFromPlainToken(?string $plainToken): ?User
    {
        return self::fromPlainToken($plainToken)?->user;
    }

    public function markUsed(): void
    {
        $this->forceFill([
            'last_used_at' => now(),
            'expires_at' => self::newExpiration(),
        ])->saveQuietly();
    }

    public static function newExpiration(): CarbonInterface
    {
        return now()->addDays(max(1, (int) config('auth.api_session_idle_timeout_days', 180)));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function displayName(): string
    {
        $userAgent = (string) $this->user_agent;
        $browser = match (true) {
            str_contains($userAgent, 'Edg/') => 'Edge',
            str_contains($userAgent, 'Firefox/') => 'Firefox',
            str_contains($userAgent, 'Chrome/') => 'Chrome',
            str_contains($userAgent, 'Safari/') => 'Safari',
            default => 'Unknown browser',
        };
        $platform = match (true) {
            str_contains($userAgent, 'Windows') => 'Windows',
            str_contains($userAgent, 'Macintosh') => 'macOS',
            str_contains($userAgent, 'iPhone') => 'iPhone',
            str_contains($userAgent, 'iPad') => 'iPad',
            str_contains($userAgent, 'Android') => 'Android',
            str_contains($userAgent, 'Linux') => 'Linux',
            default => 'Unknown device',
        };

        return $browser.' on '.$platform;
    }
}
