<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EngineBuildRevision extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['engine' => 'array', 'conditions' => 'array', 'version' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Build revisions are immutable.'));
    }

    public function build(): BelongsTo
    {
        return $this->belongsTo(EngineBuild::class, 'engine_build_id');
    }
}
