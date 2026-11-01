<?php

namespace App\Providers;

use App\Mail\WelcomeEmail;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Event::listen(Verified::class, function (Verified $event): void {
            $user = $event->user;
            if (! $user instanceof User) {
                return;
            }

            try {
                Mail::to($user->email)->send(new WelcomeEmail($user));
            } catch (\Throwable $exception) {
                Log::warning('Failed to send welcome email.', [
                    'user_id' => $user->id,
                    'error' => $exception->getMessage(),
                ]);
            }
        });
    }
}
