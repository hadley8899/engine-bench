<?php

use App\Models\ApiSession;
use Illuminate\Support\Facades\Schedule;

Schedule::call(fn () => ApiSession::query()->where('expires_at', '<=', now())->delete())->daily();
