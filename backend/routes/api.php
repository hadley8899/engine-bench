<?php

use App\Http\Controllers\Api\ApiSessionController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BenchStorageController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\CompanyUserController;
use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\WorkspaceController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login']);
    Route::post('forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('reset-password', [AuthController::class, 'resetPassword']);
    Route::post('email/verification-notification', [EmailVerificationController::class, 'send'])
        ->middleware('throttle:3,1');
    Route::get('verify-email/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware('signed')
        ->name('verification.verify');

    Route::middleware('auth.api_token')->group(function (): void {
        Route::get('workspaces', [WorkspaceController::class, 'index']);
        Route::post('workspaces', [WorkspaceController::class, 'store']);
        Route::post('workspaces/{company:uuid}/activate', [WorkspaceController::class, 'activate']);
        Route::get('builds', [BenchStorageController::class, 'index']);
        Route::post('builds', [BenchStorageController::class, 'store']);
        Route::get('builds/{build:uuid}', [BenchStorageController::class, 'show']);
        Route::get('builds/{build:uuid}/revisions/{version}', [BenchStorageController::class, 'revision'])->whereNumber('version');
        Route::post('builds/{build:uuid}/revisions', [BenchStorageController::class, 'revise']);
        Route::get('runs', [BenchStorageController::class, 'runs']);
        Route::post('runs', [BenchStorageController::class, 'saveRun']);
        Route::get('runs/{run:uuid}', [BenchStorageController::class, 'showRun']);

        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('me', [AuthController::class, 'me']);
        Route::get('sessions', [ApiSessionController::class, 'index']);
        Route::delete('sessions', [ApiSessionController::class, 'destroyAll']);
        Route::delete('sessions/{apiSession:uuid}', [ApiSessionController::class, 'destroy']);

        Route::get('notifications', [NotificationController::class, 'index']);
        Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
        Route::patch('notifications/mark-all-read', [NotificationController::class, 'markAllRead']);
        Route::patch('notifications/{notification}', [NotificationController::class, 'markRead']);

        Route::get('company', [CompanyController::class, 'show']);
        Route::patch('company', [CompanyController::class, 'update']);
        Route::post('company/setup', [CompanyController::class, 'setup']);
        Route::get('company/users', [CompanyUserController::class, 'index']);
        Route::post('company/users', [CompanyUserController::class, 'store']);
        Route::patch('company/users/{companyUser:uuid}', [CompanyUserController::class, 'update']);
        Route::delete('company/users/{companyUser:uuid}', [CompanyUserController::class, 'destroy']);
    });
});
