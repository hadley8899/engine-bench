<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EngineBuild extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    public function revisions(): HasMany
    {
        return $this->hasMany(EngineBuildRevision::class);
    }
}
