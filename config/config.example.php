<?php
declare(strict_types=1);

// Skopíruj do config.php a doplň lokálne údaje; config.php je v .gitignore.
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'tasko',
        'username' => 'root',
        'password' => '',
        'charset' => 'utf8mb4',
    ],
];
