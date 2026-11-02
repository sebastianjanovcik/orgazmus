<?php
declare(strict_types=1);

/** Vytvorí zdieľané PDO spojenie a skryje technický detail zlyhania pred klientom. */
function tasko_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $configPath = __DIR__ . '/../config/config.php';
    if (!is_file($configPath)) {
        error_log('Tasko: chýba lokálna databázová konfigurácia.');
        throw new TaskoHttpException(500, 'server_error', 'Nastala chyba servera.');
    }

    $config = require $configPath;
    $db = $config['db'] ?? [];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $db['host'] ?? '127.0.0.1',
        (int) ($db['port'] ?? 3306),
        $db['database'] ?? 'tasko'
    );

    try {
        $pdo = new PDO($dsn, $db['username'] ?? '', $db['password'] ?? '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        return $pdo;
    } catch (PDOException $error) {
        error_log('Tasko: databázové spojenie zlyhalo: ' . $error->getMessage());
        throw new TaskoHttpException(500, 'server_error', 'Nastala chyba servera.');
    }
}
