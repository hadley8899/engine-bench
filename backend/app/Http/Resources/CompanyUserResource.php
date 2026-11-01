<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanyUserResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'role' => $this->role,
            'user' => [
                'uuid' => $this->user?->uuid,
                'name' => $this->user?->name,
                'email' => $this->user?->email,
            ],
        ];
    }
}
