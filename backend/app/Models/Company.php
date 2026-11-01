<?php

namespace App\Models;

use App\Traits\HasUuid;
use Database\Factories\CompanyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Company extends Model
{
    /** @use HasFactory<CompanyFactory> */
    use HasFactory, HasUuid;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'personal_owner_id',
        'name',
        'slug',
    ];

    public function users(): HasMany
    {
        return $this->hasMany(CompanyUser::class);
    }
}
