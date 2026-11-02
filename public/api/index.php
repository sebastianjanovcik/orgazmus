<?php
declare(strict_types=1);

/**
 * Jediný vstupný bod PHP API: centralizuje hlavičky, reláciu, kontroly pôvodu
 * a prevod známych aj neočakávaných chýb na stabilnú JSON odpoveď.
 */
require_once __DIR__ . '/../../includes/http.php';
require_once __DIR__ . '/../../includes/validation.php';
require_once __DIR__ . '/../../includes/security.php';
require_once __DIR__ . '/../../includes/rules.php';
require_once __DIR__ . '/../../includes/database.php';
require_once __DIR__ . '/../../includes/tasks.php';

/** Porovná Origin s originom aktuálneho hostiteľa; API je určené pre rovnaký frontend. */
function tasko_is_same_origin(string $origin): bool
{
    $parts = parse_url($origin);
    if (
        !is_array($parts)
        || !isset($parts['scheme'], $parts['host'])
        || isset($parts['user'])
        || isset($parts['pass'])
        || isset($parts['query'])
        || isset($parts['fragment'])
        || (isset($parts['path']) && $parts['path'] !== '' && $parts['path'] !== '/')
    ) {
        return false;
    }

    $https = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower($_SERVER['HTTPS']) !== 'off';
    $expectedScheme = $https ? 'https' : 'http';
    $expectedHost = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $originHost = strtolower($parts['host']);
    if (isset($parts['port'])) {
        $originHost .= ':' . $parts['port'];
    }

    return strtolower($parts['scheme']) === $expectedScheme && hash_equals($expectedHost, $originHost);
}

/** Pri zápise vyžaduje prehliadačom poslaný Origin, čím bráni CSRF požiadavkám. */
function tasko_require_same_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!is_string($origin) || $origin === '' || !tasko_is_same_origin($origin)) {
        throw new TaskoHttpException(403, 'forbidden_origin', 'Požiadavka pochádza z nepovoleného zdroja.');
    }
}

/** Vracia verejné polia účtu; hash hesla sa nikdy nedostane do API odpovede. */
function tasko_public_user(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'email' => (string) $user['email'],
        'name' => (string) $user['name'],
        'plan' => (string) $user['plan'],
    ];
}

/** Vyžaduje platnú identitu v session a načíta aktuálny plán z databázy. */
function tasko_authenticated_user(): array
{
    $userId = $_SESSION['user']['id'] ?? null;
    if (!tasko_validate_id($userId)) {
        throw new TaskoHttpException(401, 'unauthenticated', 'Prihlásenie je potrebné.');
    }

    $statement = tasko_db()->prepare('SELECT id, email, name, password_hash, plan FROM users WHERE id = :id');
    $statement->execute(['id' => (int) $userId]);
    $user = $statement->fetch();
    if (!is_array($user)) {
        $_SESSION = [];
        throw new TaskoHttpException(401, 'unauthenticated', 'Prihlásenie je potrebné.');
    }
    $_SESSION['user'] = tasko_public_user($user);
    return $user;
}

/** Vytvorí 422 odpoveď s chybami priradenými ku konkrétnym poliam formulára. */
function tasko_validation_error(array $fields): never
{
    throw new TaskoHttpException(422, 'validation_failed', 'Skontroluj zadané údaje.', $fields);
}

/** Vráti projekt aj so súhrnnými počtami; každý výber je viazaný na vlastníka. */
function tasko_project_row(PDO $pdo, int $userId, int $projectId): array
{
    $statement = $pdo->prepare(
        'SELECT p.id, p.name, p.description, p.icon, p.color,
                COUNT(t.id) AS task_count,
                COALESCE(SUM(CASE WHEN t.is_done = 1 THEN 1 ELSE 0 END), 0) AS done_count
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         WHERE p.user_id = :user_id AND p.id = :project_id
         GROUP BY p.id, p.name, p.description, p.icon, p.color'
    );
    $statement->execute(['user_id' => $userId, 'project_id' => $projectId]);
    $project = $statement->fetch();
    if (!is_array($project)) {
        throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
    }

    return [
        'id' => (int) $project['id'],
        'name' => (string) $project['name'],
        'description' => (string) $project['description'],
        'icon' => (string) $project['icon'],
        'color' => (string) $project['color'],
        'task_count' => (int) $project['task_count'],
        'done_count' => (int) $project['done_count'],
    ];
}

try {
    // Hlavičky platia pre úspešné aj chybové odpovede; API neposkytuje obsah pre cudzie weby.
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header('Cache-Control: no-store');

    $https = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower($_SERVER['HTTPS']) !== 'off';
    session_set_cookie_params([
        'httponly' => true,
        'secure' => $https,
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    if (!session_start()) {
        throw new RuntimeException('PHP reláciu sa nepodarilo spustiť.');
    }

    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    if (!is_string($requestPath)) {
        throw new TaskoHttpException(400, 'bad_request', 'Cesta požiadavky nie je platná.');
    }

    // Pri lokálnom XAMPP môže byť public/ podpriečinkom DocumentRoot; odstráň tento prefix po Apache rewrite.
    $scriptPath = parse_url((string) ($_SERVER['SCRIPT_NAME'] ?? ''), PHP_URL_PATH);
    $frontControllerSuffix = '/api/index.php';
    if (is_string($scriptPath) && str_ends_with($scriptPath, $frontControllerSuffix)) {
        $applicationPrefix = substr($scriptPath, 0, -strlen($frontControllerSuffix));
        if ($applicationPrefix !== '' && str_starts_with($requestPath, $applicationPrefix . '/')) {
            $requestPath = substr($requestPath, strlen($applicationPrefix));
        }
    }

    // OPTIONS neotvára API pre iné originy; pre rovnaký frontend iba oznamuje povolené metódy.
    if ($method === 'OPTIONS') {
        header('Allow: GET, POST, PATCH, DELETE, OPTIONS');
        http_response_code(204);
        exit;
    }

    $route = rtrim($requestPath, '/');
    if ($route === '') {
        $route = '/';
    }

    // Známe cesty vracajú 405 pri nepodporovanej metóde namiesto zavádzajúceho 404.
    $allowedMethods = [
        '/api/auth/register' => ['POST'],
        '/api/auth/login' => ['POST'],
        '/api/auth/logout' => ['POST'],
        '/api/me' => ['GET', 'PATCH'],
        '/api/me/password' => ['PATCH'],
        '/api/me/plan' => ['GET', 'PATCH'],
        '/api/projects' => ['GET', 'POST'],
        '/api/tasks' => ['GET', 'POST'],
    ];
    if (preg_match('#^/api/projects/([^/]+)$#D', $route, $projectRoute) === 1) {
        $allowedMethods[$route] = ['GET', 'PATCH', 'DELETE'];
    }
    if (preg_match('#^/api/tasks/([^/]+)$#D', $route, $taskRoute) === 1) {
        $allowedMethods[$route] = ['GET', 'PATCH', 'DELETE'];
    }
    if (isset($allowedMethods[$route]) && !in_array($method, $allowedMethods[$route], true)) {
        header('Allow: ' . implode(', ', [...$allowedMethods[$route], 'OPTIONS']));
        throw new TaskoHttpException(405, 'method_not_allowed', 'Táto HTTP metóda nie je na danej ceste podporovaná.');
    }

    if ($route === '/api/auth/register' && $method === 'POST') {
        tasko_require_same_origin();
        $input = tasko_read_json_body();
        $name = tasko_validate_name($input['name'] ?? null);
        $email = tasko_validate_email($input['email'] ?? null);
        $password = $input['password'] ?? null;
        $fields = [];
        if ($name === null) $fields['name'] = 'Meno musí mať 1 až 60 znakov.';
        if ($email === null) $fields['email'] = 'Zadaj platnú e-mailovú adresu.';
        if (!tasko_validate_password($password)) $fields['password'] = 'Heslo musí mať 8 až 72 bajtov.';
        if ($fields !== []) tasko_validation_error($fields);

        $pdo = tasko_db();
        try {
            $pdo->beginTransaction();
            $statement = $pdo->prepare(
                "INSERT INTO users (email, name, password_hash, plan) VALUES (:email, :name, :password_hash, 'standard')"
            );
            $statement->execute([
                'email' => $email,
                'name' => $name,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ]);
            $userId = (int) $pdo->lastInsertId();
            // Každý nový účet dostane jeden pracovný priestor, aby mohol hneď vytvárať úlohy.
            $project = $pdo->prepare(
                "INSERT INTO projects (user_id, name, description, icon, color) VALUES (:user_id, 'Osobné', '', 'star', '#6558d3')"
            );
            $project->execute(['user_id' => $userId]);
            $pdo->commit();
        } catch (PDOException $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($error->getCode() === '23000') {
                throw new TaskoHttpException(409, 'email_taken', 'Účet s týmto e-mailom už existuje.');
            }
            throw $error;
        }

        if (!session_regenerate_id(true)) {
            throw new RuntimeException('ID relácie sa nepodarilo obnoviť.');
        }
        $_SESSION['user'] = ['id' => $userId, 'email' => $email, 'name' => $name, 'plan' => 'standard'];
        tasko_json_response(201, $_SESSION['user']);
    }

    if ($route === '/api/auth/login' && $method === 'POST') {
        tasko_require_same_origin();
        $input = tasko_read_json_body();
        $email = tasko_validate_email($input['email'] ?? null);
        $password = $input['password'] ?? null;
        // Neznámy e-mail tiež prejde password_verify, aby sa neodhaľovala existencia účtu.
        $dummyHash = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi';
        $statement = tasko_db()->prepare('SELECT id, email, name, password_hash, plan FROM users WHERE email = :email');
        $statement->execute(['email' => $email ?? '']);
        $user = $statement->fetch();
        $hash = is_array($user) ? (string) $user['password_hash'] : $dummyHash;
        $passwordMatches = is_string($password) && password_verify($password, $hash);
        if (!is_array($user) || !$passwordMatches) {
            throw new TaskoHttpException(401, 'invalid_credentials', 'E-mail alebo heslo nie sú správne.');
        }
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            $rehash = tasko_db()->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
            $rehash->execute(['hash' => password_hash($password, PASSWORD_DEFAULT), 'id' => $user['id']]);
        }
        if (!session_regenerate_id(true)) throw new RuntimeException('ID relácie sa nepodarilo obnoviť.');
        $_SESSION['user'] = tasko_public_user($user);
        tasko_json_response(200, $_SESSION['user']);
    }

    if ($route === '/api/auth/logout' && $method === 'POST') {
        tasko_require_same_origin();
        tasko_authenticated_user();
        $_SESSION = [];
        $cookie = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $cookie['path'],
            'domain' => $cookie['domain'],
            'secure' => $cookie['secure'],
            'httponly' => $cookie['httponly'],
            'samesite' => $cookie['samesite'] ?? 'Lax',
        ]);
        session_destroy();
        tasko_json_response(204);
    }

    if ($route === '/api/me' && $method === 'PATCH') {
        tasko_require_same_origin();
        $user = tasko_authenticated_user();
        $input = tasko_read_json_body();
        $name = tasko_validate_name($input['name'] ?? null);
        if ($name === null) tasko_validation_error(['name' => 'Meno musí mať 1 až 60 znakov.']);
        $update = tasko_db()->prepare('UPDATE users SET name = :name WHERE id = :id');
        $update->execute(['name' => $name, 'id' => $user['id']]);
        $user['name'] = $name;
        $_SESSION['user'] = tasko_public_user($user);
        tasko_json_response(200, $_SESSION['user']);
    }

    if ($route === '/api/me/password' && $method === 'PATCH') {
        tasko_require_same_origin();
        $user = tasko_authenticated_user();
        $input = tasko_read_json_body();
        $fields = [];
        if (!is_string($input['current_password'] ?? null) || $input['current_password'] === '') {
            $fields['current_password'] = 'Zadaj aktuálne heslo.';
        } elseif (!password_verify($input['current_password'], (string) $user['password_hash'])) {
            $fields['current_password'] = 'Aktuálne heslo nie je správne.';
        }
        if (!tasko_validate_password($input['new_password'] ?? null)) {
            $fields['new_password'] = 'Heslo musí mať 8 až 72 bajtov.';
        }
        if ($fields !== []) tasko_validation_error($fields);
        $update = tasko_db()->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $update->execute(['hash' => password_hash($input['new_password'], PASSWORD_DEFAULT), 'id' => $user['id']]);
        if (!session_regenerate_id(true)) throw new RuntimeException('ID relácie sa nepodarilo obnoviť.');
        tasko_json_response(204);
    }

    if ($route === '/api/me/plan' && in_array($method, ['GET', 'PATCH'], true)) {
        $config = require __DIR__ . '/../../config/config.php';
        if (($config['demo_mode'] ?? false) !== true) {
            throw new TaskoHttpException(404, 'not_found', 'Požadovaný endpoint neexistuje.');
        }
        $user = tasko_authenticated_user();
        if ($method === 'GET') tasko_json_response(200, ['plan' => (string) $user['plan']]);
        tasko_require_same_origin();
        $input = tasko_read_json_body();
        if (!in_array($input['plan'] ?? null, ['standard', 'premium'], true)) {
            tasko_validation_error(['plan' => 'Vyber platný plán.']);
        }
        $update = tasko_db()->prepare('UPDATE users SET plan = :plan WHERE id = :id');
        $update->execute(['plan' => $input['plan'], 'id' => $user['id']]);
        $user['plan'] = $input['plan'];
        $_SESSION['user'] = tasko_public_user($user);
        tasko_json_response(200, $_SESSION['user']);
    }

    if ($route === '/api/me' && $method === 'GET') {
        tasko_json_response(200, tasko_public_user(tasko_authenticated_user()));
    }

    if ($route === '/api/projects' && in_array($method, ['GET', 'POST'], true)) {
        $user = tasko_authenticated_user();
        if ($method === 'POST') tasko_require_same_origin();
        $userId = (int) $user['id'];
        $pdo = tasko_db();

        if ($method === 'GET') {
            $statement = $pdo->prepare(
                'SELECT p.id, p.name, p.description, p.icon, p.color,
                        COUNT(t.id) AS task_count,
                        COALESCE(SUM(CASE WHEN t.is_done = 1 THEN 1 ELSE 0 END), 0) AS done_count
                 FROM projects p
                 LEFT JOIN tasks t ON t.project_id = p.id
                 WHERE p.user_id = :user_id
                 GROUP BY p.id, p.name, p.description, p.icon, p.color
                 ORDER BY p.id'
            );
            $statement->execute(['user_id' => $userId]);
            $projects = array_map(static fn (array $project): array => [
                'id' => (int) $project['id'],
                'name' => (string) $project['name'],
                'description' => (string) $project['description'],
                'icon' => (string) $project['icon'],
                'color' => (string) $project['color'],
                'task_count' => (int) $project['task_count'],
                'done_count' => (int) $project['done_count'],
            ], $statement->fetchAll());
            tasko_json_response(200, $projects);
        }

        $input = tasko_read_json_body();
        $name = tasko_validate_name($input['name'] ?? null, 40);
        $description = tasko_validate_project_description($input['description'] ?? null);
        $icon = $input['icon'] ?? null;
        $icons = ['briefcase', 'house', 'book', 'idea', 'target', 'pin'];
        $fields = [];
        if ($name === null) $fields['name'] = 'Názov musí mať 1 až 40 znakov.';
        if ($description === null) $fields['description'] = 'Popis môže mať najviac 200 znakov.';
        if (!is_string($icon) || !in_array($icon, $icons, true)) $fields['icon'] = 'Vyber platnú ikonu.';
        if ($fields !== []) tasko_validation_error($fields);

        // Zámok používateľa serializuje vytváranie projektov tej istej identity,
        // takže dve súbežné požiadavky nemôžu obe obísť limit Standard.
        try {
            $pdo->beginTransaction();
            $lock = $pdo->prepare('SELECT plan FROM users WHERE id = :id FOR UPDATE');
            $lock->execute(['id' => $userId]);
            $plan = $lock->fetchColumn();
            if (!is_string($plan)) throw new TaskoHttpException(401, 'unauthenticated', 'Prihlásenie je potrebné.');
            tasko_require_project_capacity($pdo, $userId, $plan);

            $countQuery = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = :user_id');
            $countQuery->execute(['user_id' => $userId]);
            $colors = ['#6558d3', '#e28a42', '#4188c7', '#45a875', '#c45678', '#8a71d8', '#4e9b9b', '#bd9a36'];
            $color = $colors[(int) $countQuery->fetchColumn() % count($colors)];
            $insert = $pdo->prepare(
                'INSERT INTO projects (user_id, name, description, icon, color)
                 VALUES (:user_id, :name, :description, :icon, :color)'
            );
            $insert->execute([
                'user_id' => $userId,
                'name' => $name,
                'description' => $description,
                'icon' => $icon,
                'color' => $color,
            ]);
            $projectId = (int) $pdo->lastInsertId();
            $pdo->commit();
        } catch (PDOException $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if (($error->errorInfo[1] ?? null) === 1062) {
                throw new TaskoHttpException(409, 'name_taken', 'Projekt s týmto názvom už existuje.');
            }
            throw $error;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        tasko_json_response(201, tasko_project_row($pdo, $userId, $projectId));
    }

    if (preg_match('#^/api/projects/([^/]+)$#D', $route, $projectRoute) === 1) {
        $user = tasko_authenticated_user();
        $userId = (int) $user['id'];
        $projectId = $projectRoute[1];
        if (!tasko_validate_id($projectId)) {
            throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
        }
        $projectId = (int) $projectId;
        $pdo = tasko_db();

        if ($method === 'GET') {
            tasko_json_response(200, tasko_project_row($pdo, $userId, $projectId));
        }

        if ($method === 'PATCH') {
            tasko_require_same_origin();
            $input = tasko_read_json_body();
            $allowedFields = ['name', 'description', 'icon'];
            $unknown = array_diff(array_keys($input), $allowedFields);
            if ($unknown !== [] || array_intersect(array_keys($input), $allowedFields) === []) {
                tasko_validation_error(['project' => 'Pošli aspoň jedno povolené pole projektu.']);
            }
            // Najprv sa overí vlastníctvo, aby sa cudzie ID správalo rovnako ako chýbajúce.
            tasko_project_row($pdo, $userId, $projectId);
            $values = [];
            $fields = [];
            if (array_key_exists('name', $input)) {
                $values['name'] = tasko_validate_name($input['name'], 40);
                if ($values['name'] === null) $fields['name'] = 'Názov musí mať 1 až 40 znakov.';
            }
            if (array_key_exists('description', $input)) {
                $values['description'] = tasko_validate_project_description($input['description']);
                if ($values['description'] === null) $fields['description'] = 'Popis môže mať najviac 200 znakov.';
            }
            if (array_key_exists('icon', $input)) {
                $icons = ['briefcase', 'house', 'book', 'idea', 'target', 'pin'];
                $values['icon'] = $input['icon'];
                if (!is_string($values['icon']) || !in_array($values['icon'], $icons, true)) $fields['icon'] = 'Vyber platnú ikonu.';
            }
            if ($fields !== []) tasko_validation_error($fields);

            $assignments = [];
            foreach ($values as $field => $value) $assignments[] = "`$field` = :$field";
            $values['project_id'] = $projectId;
            $values['user_id'] = $userId;
            try {
                $update = $pdo->prepare('UPDATE projects SET ' . implode(', ', $assignments) . ' WHERE id = :project_id AND user_id = :user_id');
                $update->execute($values);
            } catch (PDOException $error) {
                if (($error->errorInfo[1] ?? null) === 1062) {
                    throw new TaskoHttpException(409, 'name_taken', 'Projekt s týmto názvom už existuje.');
                }
                throw $error;
            }
            tasko_json_response(200, tasko_project_row($pdo, $userId, $projectId));
        }

        if ($method === 'DELETE') {
            tasko_require_same_origin();
            try {
                $pdo->beginTransaction();
                // Rovnaký zámok ako pri vytvorení bráni súbehu mazania a vytvárania.
                $lock = $pdo->prepare('SELECT id FROM users WHERE id = :id FOR UPDATE');
                $lock->execute(['id' => $userId]);
                if ($lock->fetchColumn() === false) throw new TaskoHttpException(401, 'unauthenticated', 'Prihlásenie je potrebné.');
                $owned = $pdo->prepare('SELECT id FROM projects WHERE id = :id AND user_id = :user_id FOR UPDATE');
                $owned->execute(['id' => $projectId, 'user_id' => $userId]);
                if ($owned->fetchColumn() === false) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
                $count = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = :user_id');
                $count->execute(['user_id' => $userId]);
                if ((int) $count->fetchColumn() <= 1) {
                    throw new TaskoHttpException(409, 'last_project', 'Posledný projekt nemožno zmazať.');
                }
                $delete = $pdo->prepare('DELETE FROM projects WHERE id = :id AND user_id = :user_id');
                $delete->execute(['id' => $projectId, 'user_id' => $userId]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            tasko_json_response(204);
        }
    }

    if ($route === '/api/tasks' && in_array($method, ['GET', 'POST'], true)) {
        $user = tasko_authenticated_user();
        if ($method === 'POST') {
            tasko_require_same_origin();
            $input = tasko_read_json_body();
            $title = tasko_validate_name($input['title'] ?? null, 150);
            $descriptionInput = $input['description'] ?? null;
            $description = tasko_validate_task_description($descriptionInput);
            $projectId = $input['project_id'] ?? null;
            $priority = $input['priority'] ?? 2;
            $dueDate = $input['due_date'] ?? null;
            $fields = [];
            if ($title === null) $fields['title'] = 'Názov musí mať 1 až 150 znakov.';
            if ($descriptionInput !== null) {
                $descriptionLength = is_string($descriptionInput) ? tasko_text_length($descriptionInput) : null;
                if ($descriptionLength === null || $descriptionLength > 2000) {
                    $fields['description'] = 'Popis môže mať najviac 2 000 znakov.';
                }
            }
            if (!tasko_validate_id($projectId)) $fields['project_id'] = 'Vyber platný projekt.';
            if (!tasko_validate_priority($priority)) $fields['priority'] = 'Vyber prioritu od 1 do 4.';
            if (!tasko_validate_date($dueDate)) $fields['due_date'] = 'Zadaj platný dátum YYYY-MM-DD.';
            if ($fields !== []) tasko_validation_error($fields);

            // Vlastníctvo projektu overuje server ešte pred zápisom, aj keď ho klient zobrazil vo výbere.
            $pdo = tasko_db();
            $project = $pdo->prepare('SELECT id FROM projects WHERE id = :project_id AND user_id = :user_id');
            $project->execute(['project_id' => (int) $projectId, 'user_id' => $user['id']]);
            if ($project->fetchColumn() === false) tasko_validation_error(['project_id' => 'Vybraný projekt neexistuje.']);

            $insert = $pdo->prepare(
                'INSERT INTO tasks (project_id, title, description, priority, due_date)
                 VALUES (:project_id, :title, :description, :priority, :due_date)'
            );
            $insert->execute([
                'project_id' => (int) $projectId,
                'title' => $title,
                'description' => $description,
                'priority' => (int) $priority,
                'due_date' => $dueDate,
            ]);
            tasko_json_response(201, tasko_task_find($pdo, (int) $user['id'], (int) $pdo->lastInsertId()));
        }

        $filters = tasko_task_filters($_GET);
        tasko_json_response(200, tasko_tasks_find(tasko_db(), (int) $user['id'], $filters));
    }

    if (preg_match('#^/api/tasks/([^/]+)$#D', $route, $taskRoute) === 1 && in_array($method, ['GET', 'PATCH', 'DELETE'], true)) {
        $user = tasko_authenticated_user();
        if (!tasko_validate_id($taskRoute[1])) {
            throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
        }
        $taskId = (int) $taskRoute[1];
        $pdo = tasko_db();
        $current = tasko_task_find($pdo, (int) $user['id'], $taskId);

        if ($method === 'GET') tasko_json_response(200, $current);
        tasko_require_same_origin();
        if ($method === 'DELETE') {
            $delete = $pdo->prepare(
                'DELETE t FROM tasks t INNER JOIN projects p ON p.id = t.project_id
                 WHERE t.id = :task_id AND p.user_id = :user_id'
            );
            $delete->execute(['task_id' => $taskId, 'user_id' => $user['id']]);
            tasko_json_response(204);
        }

        $input = tasko_read_json_body();
        // Povolené názvy polí tvoria aj zoznam SQL identifikátorov; hodnoty ostávajú parametrizované.
        $allowedFields = ['title', 'description', 'project_id', 'priority', 'due_date'];
        $unknown = array_diff(array_keys($input), $allowedFields);
        if ($unknown !== [] || $input === []) {
            tasko_validation_error(['task' => 'Pošli aspoň jedno povolené pole úlohy.']);
        }

        $values = [];
        $fields = [];
        if (array_key_exists('title', $input)) {
            $values['title'] = tasko_validate_name($input['title'], 150);
            if ($values['title'] === null) $fields['title'] = 'Názov musí mať 1 až 150 znakov.';
        }
        if (array_key_exists('description', $input)) {
            $values['description'] = tasko_validate_task_description($input['description']);
            if ($input['description'] !== null) {
                $descriptionLength = is_string($input['description']) ? tasko_text_length($input['description']) : null;
                if ($descriptionLength === null || $descriptionLength > 2000) {
                    $fields['description'] = 'Popis môže mať najviac 2 000 znakov.';
                }
            }
        }
        if (array_key_exists('project_id', $input)) {
            $values['project_id'] = $input['project_id'];
            if (!tasko_validate_id($values['project_id'])) {
                $fields['project_id'] = 'Vyber platný projekt.';
            } else {
                $project = $pdo->prepare('SELECT id FROM projects WHERE id = :project_id AND user_id = :user_id');
                $project->execute(['project_id' => (int) $values['project_id'], 'user_id' => $user['id']]);
                if ($project->fetchColumn() === false) $fields['project_id'] = 'Vybraný projekt neexistuje.';
                else $values['project_id'] = (int) $values['project_id'];
            }
        }
        if (array_key_exists('priority', $input)) {
            $values['priority'] = $input['priority'];
            if (!tasko_validate_priority($values['priority'])) $fields['priority'] = 'Vyber prioritu od 1 do 4.';
            else $values['priority'] = (int) $values['priority'];
        }
        if (array_key_exists('due_date', $input)) {
            $values['due_date'] = $input['due_date'];
            if (!tasko_validate_date($values['due_date'])) $fields['due_date'] = 'Zadaj platný dátum YYYY-MM-DD.';
        }
        if ($fields !== []) tasko_validation_error($fields);

        $assignments = [];
        foreach (array_keys($values) as $field) $assignments[] = "`$field` = :$field";
        $values['task_id'] = $taskId;
        $values['user_id'] = (int) $user['id'];
        $update = $pdo->prepare(
            'UPDATE tasks t INNER JOIN projects p ON p.id = t.project_id SET ' . implode(', ', $assignments) .
            ' WHERE t.id = :task_id AND p.user_id = :user_id'
        );
        $update->execute($values);
        tasko_json_response(200, tasko_task_find($pdo, (int) $user['id'], $taskId));
    }

    // Metódy meniace stav sa nikdy nevykonajú bez rovnakého originu.
    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        tasko_require_same_origin();
    }

    throw new TaskoHttpException(404, 'not_found', 'Požadovaný endpoint neexistuje.');
} catch (Throwable $error) {
    tasko_handle_exception($error);
}
