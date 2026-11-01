<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Symfony\Component\HttpFoundation\Response;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $notifications = $user->notifications()
            ->latest()
            ->limit(50)
            ->get();

        return response()->json([
            'notifications' => $notifications->map(fn (DatabaseNotification $notification) => [
                'id' => $notification->id,
                'type' => $notification->type,
                'data' => $notification->data,
                'read_at' => $notification->read_at,
                'created_at' => $notification->created_at,
            ]),
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        return response()->json([
            'count' => $user->unreadNotifications()->count(),
        ]);
    }

    public function markRead(Request $request, DatabaseNotification $notification): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        if ($notification->notifiable_id !== $user->id) {
            abort(Response::HTTP_NOT_FOUND);
        }

        $notification->markAsRead();

        return response()->json([
            'notification' => [
                'id' => $notification->id,
                'read_at' => $notification->read_at,
            ],
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $markedReadCount = $user->unreadNotifications()->count();
        $user->unreadNotifications->markAsRead();

        return response()->json([
            'marked_read_count' => $markedReadCount,
        ]);
    }
}
