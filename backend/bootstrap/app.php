<?php

use App\Http\Middleware\ApiTokenAuth;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $benchDocument = fn (Request $request): bool => $request->is('api/auth/builds*', 'api/auth/runs*');
        $middleware->convertEmptyStringsToNull(except: [$benchDocument]);
        $middleware->trimStrings(except: [$benchDocument]);
        $middleware->alias([
            'auth.api_token' => ApiTokenAuth::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();

$storagePath = $_ENV['APP_STORAGE_PATH'] ?? $_SERVER['APP_STORAGE_PATH'] ?? null;
if (is_string($storagePath) && $storagePath !== '') {
    $app->useStoragePath($storagePath);
}

return $app;
