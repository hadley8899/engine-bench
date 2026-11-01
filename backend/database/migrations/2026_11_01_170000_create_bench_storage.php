<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->foreignId('personal_owner_id')->nullable()->unique()->constrained('users')->nullOnDelete();
        });
        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('active_company_id')->nullable()->constrained('companies')->nullOnDelete();
        });
        Schema::create('engine_builds', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('name', 80);
            $table->unsignedInteger('current_revision')->default(1);
            $table->timestamps();
            $table->index(['company_id', 'updated_at']);
        });
        Schema::create('engine_build_revisions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('engine_build_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->unsignedInteger('schema_version');
            $table->json('engine');
            $table->json('conditions');
            $table->string('snapshot_hash', 64);
            $table->timestamps();
            $table->unique(['engine_build_id', 'version']);
        });
        Schema::create('dyno_runs', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('engine_build_revision_id')->constrained()->restrictOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('client_run_id', 128);
            $table->unsignedInteger('schema_version');
            $table->string('model_version', 80);
            $table->string('runtime', 512);
            $table->json('engine');
            $table->json('conditions');
            $table->json('procedure');
            $table->string('status', 20);
            $table->text('reason');
            $table->json('warnings');
            $table->longText('sample_blob');
            $table->unsignedInteger('sample_count');
            $table->unsignedInteger('sample_bytes');
            $table->double('peak_power')->nullable();
            $table->double('peak_torque')->nullable();
            $table->string('submission_hash', 64);
            $table->timestamps();
            $table->unique(['company_id', 'created_by_user_id', 'client_run_id'], 'dyno_run_retry_key');
            $table->index(['company_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dyno_runs');
        Schema::dropIfExists('engine_build_revisions');
        Schema::dropIfExists('engine_builds');
        Schema::table('users', fn (Blueprint $table) => $table->dropConstrainedForeignId('active_company_id'));
        Schema::table('companies', fn (Blueprint $table) => $table->dropConstrainedForeignId('personal_owner_id'));
    }
};
