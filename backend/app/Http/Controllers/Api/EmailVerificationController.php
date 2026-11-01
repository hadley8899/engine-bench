<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ResendVerificationEmailRequest;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EmailVerificationController extends Controller
{
    public function send(ResendVerificationEmailRequest $request): JsonResponse
    {
        $user = User::query()->where('email', $request->string('email')->toString())->first();

        if ($user !== null && ! $user->hasVerifiedEmail()) {
            $user->sendEmailVerificationNotification();
        }

        return response()->json([
            'message' => 'If your email address is registered, a verification email has been sent.',
        ]);
    }

    public function verify(Request $request, int $id, string $hash): Response
    {
        if (! $request->hasValidSignature()) {
            return response()->json([
                'message' => 'Invalid or expired verification link.',
            ], Response::HTTP_FORBIDDEN);
        }

        $user = User::query()->find($id);

        if ($user === null) {
            return response()->json([
                'message' => 'User not found.',
            ], Response::HTTP_NOT_FOUND);
        }

        if (! hash_equals($hash, sha1($user->getEmailForVerification()))) {
            return response()->json([
                'message' => 'Invalid verification link.',
            ], Response::HTTP_FORBIDDEN);
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
        }

        $frontendUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return redirect()->away($frontendUrl.'/login');
    }
}
