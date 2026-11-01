<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/reset-password/{token}', function (string $token) {
    $frontendUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');
    $email = request()->query('email');

    $query = http_build_query(array_filter([
        'token' => $token,
        'email' => $email,
    ]));

    return redirect()->away($frontendUrl.'/reset-password'.($query !== '' ? '?'.$query : ''));
})->name('password.reset');
