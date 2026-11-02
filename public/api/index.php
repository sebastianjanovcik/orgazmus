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
    ];
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

    // Metódy meniace stav sa nikdy nevykonajú bez rovnakého originu.
    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        tasko_require_same_origin();
    }

    throw new TaskoHttpException(404, 'not_found', 'Požadovaný endpoint neexistuje.');
} catch (Throwable $error) {
    tasko_handle_exception($error);
}
