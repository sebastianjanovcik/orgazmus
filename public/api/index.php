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

    if ($route === '/api/me') {
        if ($method !== 'GET') {
            header('Allow: GET, OPTIONS');
            throw new TaskoHttpException(405, 'method_not_allowed', 'Táto HTTP metóda nie je na danej ceste podporovaná.');
        }

        $user = $_SESSION['user'] ?? null;
        if (!is_array($user) || !isset($user['id'], $user['email'], $user['name'], $user['plan'])) {
            throw new TaskoHttpException(401, 'unauthenticated', 'Na zobrazenie tejto stránky sa musíš prihlásiť.');
        }

        // Relácia smie do verejného API poskytnúť iba verejné polia používateľa.
        tasko_json_response(200, [
            'id' => (int) $user['id'],
            'email' => (string) $user['email'],
            'name' => (string) $user['name'],
            'plan' => (string) $user['plan'],
        ]);
    }

    // Metódy meniace stav sa nikdy nevykonajú bez rovnakého originu.
    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        tasko_require_same_origin();
    }

    throw new TaskoHttpException(404, 'not_found', 'Požadovaný endpoint neexistuje.');
} catch (Throwable $error) {
    tasko_handle_exception($error);
}
