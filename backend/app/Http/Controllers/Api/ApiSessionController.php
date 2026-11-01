<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiSession;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApiSessionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $currentSession = $request->attributes->get('api_session');

        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $sessions = $user->apiSessions()
            ->where('expires_at', '>', now())
            ->latest('last_used_at')
            ->latest('created_at')
            ->get()
            ->map(fn (ApiSession $session): array => $this->payload($session, $currentSession));

        return response()->json(['sessions' => $sessions]);
    }

    public function destroy(Request $request, ApiSession $apiSession): JsonResponse
    {
        $user = $request->user();
        if (! $user instanceof User || $apiSession->user_id !== $user->id) {
            return response()->json(['message' => 'Session not found.'], Response::HTTP_NOT_FOUND);
        }

        $wasCurrent = $request->attributes->get('api_session')?->is($apiSession) ?? false;
        $apiSession->delete();

        return response()->json([
            'message' => 'Session signed out.',
            'signed_out_current_session' => $wasCurrent,
        ]);
    }

    public function destroyAll(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $count = $user->apiSessions()->delete();

        return response()->json([
            'message' => 'All sessions signed out.',
            'signed_out_sessions' => $count,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(ApiSession $session, mixed $currentSession): array
    {
        return [
            'uuid' => $session->uuid,
            'display_name' => $session->displayName(),
            'ip_address' => $session->ip_address,
            'last_used_at' => $session->last_used_at?->toISOString(),
            'expires_at' => $session->expires_at?->toISOString(),
            'created_at' => $session->created_at?->toISOString(),
            'is_current' => $currentSession instanceof ApiSession && $currentSession->is($session),
        ];
    }
}
