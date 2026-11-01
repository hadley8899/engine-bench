<?php

// Force test DB routing before Laravel boots.
putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
$_SERVER['APP_ENV'] = 'testing';

putenv('DB_CONNECTION=mysql_testing');
$_ENV['DB_CONNECTION'] = 'mysql_testing';
$_SERVER['DB_CONNECTION'] = 'mysql_testing';

$defaults = [
    'DB_TEST_HOST' => 'mysql',
    'DB_TEST_PORT' => '3306',
    'DB_TEST_DATABASE' => 'engine_bench_test',
    'DB_TEST_USERNAME' => 'root',
    'DB_TEST_PASSWORD' => '',
    // Safety net: if anything falls back to DB_DATABASE, keep it on test DB.
    'DB_DATABASE' => 'engine_bench_test',
];

foreach ($defaults as $key => $value) {
    if ((getenv($key) === false || getenv($key) === '') && (! isset($_ENV[$key]) || $_ENV[$key] === '')) {
        putenv($key.'='.$value);
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }
}

if (extension_loaded('pdo_mysql')) {
    $host = getenv('DB_TEST_HOST') ?: 'mysql';
    $port = getenv('DB_TEST_PORT') ?: '3306';
    $database = getenv('DB_TEST_DATABASE') ?: 'engine_bench_test';
    $username = getenv('DB_TEST_USERNAME') ?: 'root';
    $password = getenv('DB_TEST_PASSWORD') ?: '';

    if (! str_ends_with($database, '_test') || ! preg_match('/^[a-zA-Z0-9_]+$/', $database)) {
        fwrite(STDERR, "Refusing to run tests unless the database name ends in _test.\n");
        exit(1);
    }

    try {
        $pdo = new PDO(
            sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $host, $port),
            $username,
            $password,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
        );

        $quotedDatabase = str_replace('`', '``', $database);
        $pdo->exec(sprintf('CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', $quotedDatabase));
    } catch (Throwable) {
        // Let Laravel/PHPUnit surface a clear DB connection error in test output.
    }
}

require __DIR__.'/../vendor/autoload.php';
