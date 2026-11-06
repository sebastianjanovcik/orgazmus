<?php
declare(strict_types=1);

// Skopíruj do config.php a doplň lokálne údaje; config.php je v .gitignore.
return [
    // Prílohy sú mimo verejného koreňa; produkcia má zadať samostatný súkromný adresár.
    'attachments' => [
        'directory' => dirname(__DIR__) . '/var/attachments',
    ],
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'tasko',
        'username' => 'root',
        'password' => '',
        'charset' => 'utf8mb4',
    ],
];
