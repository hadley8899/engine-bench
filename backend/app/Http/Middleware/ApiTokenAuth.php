<?php

namespace App\Http\Middleware;

use App\Models\ApiSession;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApiTokenAuth
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $plainToken = $request->bearerToken();

        if ($plainToken === null) {
            return response()->json([
                'message' => 'Authentication token missing.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $apiSession = ApiSession::fromPlainToken($plainToken);
        $user = $apiSession?->user;

        if ($user === null) {
            return response()->json([
                'message' => 'Invalid authentication token.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $request->attributes->set('api_session', $apiSession);

        $request->setUserResolver(function () use ($user): User {
            return $user;
        });

        return $next($request);
    }
}
