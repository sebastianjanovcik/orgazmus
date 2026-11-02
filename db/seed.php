<?php
declare(strict_types=1);

/*
 * Opakovateľný seed lokálneho dema. Použité pevné ID zjednodušujú väzby;
 * heslá sa vytvoria náhodne, zahashujú v PHP a zobrazia iba pri spustení.
 */
$configPath = __DIR__ . '/../config/config.php';
if (!is_file($configPath)) {
    fwrite(STDERR, "Chýba config/config.php. Skopíruj config/config.example.php a nastav DB.\n");
    exit(1);
}

$config = require $configPath;
$db = $config['db'] ?? [];
$dsn = sprintf(
    'mysql:host=%s;port=%d;dbname=%s;charset=%s',
    $db['host'] ?? '127.0.0.1',
    (int) ($db['port'] ?? 3306),
    $db['database'] ?? 'tasko',
    $db['charset'] ?? 'utf8mb4'
);

try {
    $pdo = new PDO($dsn, $db['username'] ?? '', $db['password'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->beginTransaction();

    // Pevné heslo uľahčuje lokálne testovanie; do databázy sa uloží iba jeho hash.
    $users = [
        1 => ['jana@example.sk', 'Jana Nová', 'standard', 'sebo5599'],
        2 => ['premium@example.sk', 'Peter Prémiový', 'premium', bin2hex(random_bytes(16))],
    ];
    $userStatement = $pdo->prepare(
        'INSERT INTO users (id, email, name, password_hash, plan)
         VALUES (:id, :email, :name, :password_hash, :plan)
         ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name),
             password_hash = VALUES(password_hash), plan = VALUES(plan)'
    );
    foreach ($users as $id => [$email, $name, $plan, $password]) {
        $userStatement->execute([
            'id' => $id,
            'email' => $email,
            'name' => $name,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'plan' => $plan,
        ]);
    }

    $projects = [
        [10, 1, 'Práca', 'Pracovné úlohy', 'briefcase', '#6558d3'],
        [11, 1, 'Domácnosť', 'Veci na vybavenie doma', 'house', '#2f9e8f'],
        [12, 1, 'Osobné', 'Osobné ciele a nápady', 'star', '#e18b42'],
        [20, 2, 'Produkt', 'Príprava ďalšieho vydania', 'lightbulb', '#6558d3'],
    ];
    $projectStatement = $pdo->prepare(
        'INSERT INTO projects (id, user_id, name, description, icon, color)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), name = VALUES(name),
             description = VALUES(description), icon = VALUES(icon), color = VALUES(color)'
    );
    foreach ($projects as $project) {
        $projectStatement->execute($project);
    }

    $tasks = [
        [100, 10, 'Pripraviť návrh', '<p>Prvá verzia návrhu na kontrolu.</p>', 3, '2026-11-06', false, null],
        [101, 10, 'Poslať podklady tímu', null, 2, '2026-11-03', true, '2026-10-30 12:00:00'],
        [102, 11, 'Kúpiť žiarovky', null, 1, '2026-11-08', false, null],
        [103, 20, 'Skontrolovať spätnú väzbu', '<p>Zhrnúť pripomienky z posledného kola.</p>', 4, '2026-11-05', false, null],
    ];
    $taskStatement = $pdo->prepare(
        'INSERT INTO tasks (id, project_id, title, description, priority, due_date, is_done, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE project_id = VALUES(project_id), title = VALUES(title),
             description = VALUES(description), priority = VALUES(priority), due_date = VALUES(due_date),
             is_done = VALUES(is_done), completed_at = VALUES(completed_at)'
    );
    foreach ($tasks as $task) {
        $taskStatement->execute($task);
    }

    $comments = [
        [1000, 103, null, 2, 'Začnem s prvou verziou ešte dnes.'],
        [1001, 103, 1000, 2, 'Dohodnuté, pošlem pripomienky zajtra.'],
        [1002, 103, null, 2, 'Zahrnúť aj komentáre z používateľských rozhovorov.'],
    ];
    $commentStatement = $pdo->prepare(
        'INSERT INTO comments (id, task_id, parent_id, author_id, body)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE task_id = VALUES(task_id), parent_id = VALUES(parent_id),
             author_id = VALUES(author_id), body = VALUES(body)'
    );
    foreach ($comments as $comment) {
        $commentStatement->execute($comment);
    }

    $pdo->commit();
    fwrite(STDOUT, "Seed dokončen. Nové lokálne prihlasovacie údaje (ulož si ich mimo repozitára):\n");
    fwrite(STDOUT, "jana@example.sk / {$users[1][3]}\n");
    fwrite(STDOUT, "premium@example.sk / {$users[2][3]}\n");
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Seed zlyhal: {$error->getMessage()}\n");
    exit(1);
}
