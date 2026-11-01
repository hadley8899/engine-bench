<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;
use Opis\JsonSchema\Validator;

class BenchDocuments
{
    public const MAX_BODY_BYTES = 1048576;

    public const MAX_COMPRESSED_BYTES = 262144;

    public function validate(string $schema, mixed $value, string $field): array
    {
        $definition = file_get_contents(resource_path('schemas/'.$schema.'.schema.json'));
        $validator = new Validator;
        $result = $validator->validate(json_decode(json_encode($value, JSON_THROW_ON_ERROR)), json_decode($definition, false, 512, JSON_THROW_ON_ERROR));
        if (! $result->isValid()) {
            throw ValidationException::withMessages([$field => 'This document does not match the supported '.$schema.' schema.']);
        }

        return $value;
    }

    public function recipe(mixed $engine, mixed $conditions): array
    {
        $e = $this->validate('engine', $engine, 'engine');
        $c = $this->validate('conditions', $conditions, 'conditions');
        if (trim($e['name']) === '') {
            throw ValidationException::withMessages(['engine.name' => 'An engine name is required.']);
        }
        // Mirrors MIN_ROD_STROKE in frontend/src/sim/schema.ts.
        if ($e['rodLength'] < $e['stroke'] * 0.75 - 1e-9) {
            throw ValidationException::withMessages(['engine.rodLength' => 'Rod length must be at least 0.75 × stroke.']);
        }

        return ['engine' => $e, 'conditions' => $c];
    }

    public function run(mixed $value): array
    {
        $run = $this->validate('run', $value, 'run');
        $this->recipe($run['engine'], $run['conditions']);
        $p = $run['procedure'];
        if ($run['status'] === 'running') {
            throw ValidationException::withMessages(['run.status' => 'Only completed or aborted runs can be saved.']);
        }
        if ($p['endRpm'] <= $p['startRpm'] || $p['endRpm'] > $run['engine']['revLimit'] - 100 || $p['endRpm'] >= $run['engine']['mechanicalLimit']) {
            throw ValidationException::withMessages(['run.procedure' => 'Test RPM range conflicts with the snapshot limits.']);
        }
        if ($run['status'] === 'complete' && count($run['samples']) < 2) {
            throw ValidationException::withMessages(['run.samples' => 'A completed test needs at least two samples.']);
        }
        $time = -1;
        foreach ($run['samples'] as $sample) {
            $expected = $sample['torque'] * $sample['rpm'] * M_PI / 30000;
            if ($sample['time'] <= $time || abs($sample['power'] - $expected) > .001 + abs($expected) * .000001) {
                throw ValidationException::withMessages(['run.samples' => 'Samples need increasing times and consistent torque/power units.']);
            }
            $time = $sample['time'];
        }

        return $run;
    }

    public function hash(array $value): string
    {
        return hash('sha256', json_encode($this->canonical($value), JSON_THROW_ON_ERROR));
    }

    private function canonical(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }
        foreach ($value as &$item) {
            if (is_array($item)) {
                $item = $this->canonical($item);
            }
        }

        return $value;
    }
}
