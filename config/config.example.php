<?php
declare(strict_types=1);

// Skopíruj do config.php a doplň lokálne údaje; config.php je v .gitignore.
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'tasko',
        'username' => 'tasko',
        'password' => 'DOPLN_LOKALNE_HESLO',
        'charset' => 'utf8mb4',
    ],
];
