<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DynoRun extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['engine' => 'array', 'conditions' => 'array', 'procedure' => 'array', 'warnings' => 'array'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Saved runs are immutable.'));
    }

    public function revision(): BelongsTo
    {
        return $this->belongsTo(EngineBuildRevision::class, 'engine_build_revision_id');
    }

    public function document(): array
    {
        $stored = json_decode(gzdecode(base64_decode($this->sample_blob, true), 1048576), true, 512, JSON_THROW_ON_ERROR);
        // A run with a run-down stores both; earlier runs store the samples alone.
        $withRundown = is_array($stored) && array_key_exists('samples', $stored);

        return [
            'schemaVersion' => $this->schema_version, 'modelVersion' => $this->model_version,
            'id' => $this->client_run_id, 'runtime' => $this->runtime,
            'engine' => $this->engine, 'conditions' => $this->conditions, 'procedure' => $this->procedure,
            'status' => $this->status, 'reason' => $this->reason, 'warnings' => $this->warnings,
            'samples' => $withRundown ? $stored['samples'] : $stored,
            ...($withRundown ? ['rundown' => $stored['rundown']] : []),
        ];
    }
}
