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
require_once __DIR__ . '/../../includes/comments.php';
require_once __DIR__ . '/../../includes/notifications.php';

/** Číta členov iba v projekte, ku ktorému má prihlásený účet prístup. */
function tasko_project_members(PDO $pdo, int $projectId, int $userId): array
{
    $access = $pdo->prepare(
        'SELECT p.user_id FROM projects p
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
         WHERE p.id = :project_id AND (p.user_id = :owner_id OR pm.can_view_project = 1)'
    );
    $access->execute(['member_id' => $userId, 'project_id' => $projectId, 'owner_id' => $userId]);
    $ownerId = $access->fetchColumn();
    if ($ownerId === false) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');

    $statement = $pdo->prepare(
        'SELECT u.id, u.name, u.email, pm.added_at, pm.can_view_project, pm.can_manage_project, pm.can_manage_members,
                pm.can_view_tasks, pm.can_add_tasks, pm.can_complete_tasks, pm.can_edit_own_tasks,
                pm.can_edit_other_tasks, pm.can_delete_own_tasks, pm.can_delete_other_tasks,
                pm.can_view_comments, pm.can_add_comments, pm.can_edit_own_comments,
                pm.can_edit_other_comments, pm.can_delete_own_comments, pm.can_delete_other_comments
         FROM project_members pm INNER JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = :project_id ORDER BY (u.id = :owner_id) DESC, u.name, u.id'
    );
    $statement->execute(['project_id' => $projectId, 'owner_id' => (int) $ownerId]);
    $permissionFields = [
        'can_view_project', 'can_manage_project', 'can_manage_members', 'can_view_tasks', 'can_add_tasks',
        'can_complete_tasks', 'can_edit_own_tasks', 'can_edit_other_tasks', 'can_delete_own_tasks',
        'can_delete_other_tasks', 'can_view_comments', 'can_add_comments', 'can_edit_own_comments',
        'can_edit_other_comments', 'can_delete_own_comments', 'can_delete_other_comments',
    ];
    return array_map(static function (array $member) use ($ownerId, $permissionFields): array {
        $isOwner = (int) $member['id'] === (int) $ownerId;
        $permissions = [];
        foreach ($permissionFields as $field) $permissions[$field] = $isOwner || (bool) $member[$field];
        return [
            'id' => (int) $member['id'], 'name' => (string) $member['name'],
            'email' => (string) $member['email'], 'is_owner' => $isOwner,
            'added_at' => (new DateTimeImmutable((string) $member['added_at'], new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s\\Z'),
            'permissions' => $permissions,
        ];
    }, $statement->fetchAll());
}

/** Jednotný zoznam práv zdieľaný medzi validáciou API a uložením členstva. */
function tasko_project_permission_fields(): array
{
    return [
        'can_view_project', 'can_manage_project', 'can_manage_members', 'can_view_tasks', 'can_add_tasks',
        'can_complete_tasks', 'can_edit_own_tasks', 'can_edit_other_tasks', 'can_delete_own_tasks',
        'can_delete_other_tasks', 'can_view_comments', 'can_add_comments', 'can_edit_own_comments',
        'can_edit_other_comments', 'can_delete_own_comments', 'can_delete_other_comments',
    ];
}

/** Vlastník aj člen s právom správy členov môžu spravovať pozvánky a členstvo. */
function tasko_require_project_member_manager(PDO $pdo, int $projectId, int $userId): int
{
    $query = $pdo->prepare(
        'SELECT p.user_id, pm.can_manage_members FROM projects p
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
         WHERE p.id = :project_id'
    );
    $query->execute(['member_id' => $userId, 'project_id' => $projectId]);
    $row = $query->fetch();
    if (!is_array($row)) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
    if ((int) $row['user_id'] !== $userId && !(bool) $row['can_manage_members']) {
        throw new TaskoHttpException(403, 'forbidden', 'Nemáš právo spravovať členov projektu.');
    }
    return (int) $row['user_id'];
}

/** Serializuje oprávnenia v stabilnom tvare API bez stavu databázových hodnôt. */
function tasko_invitation_row(array $row): array
{
    $permissions = [];
    foreach (tasko_project_permission_fields() as $field) $permissions[$field] = (bool) $row[$field];
    return [
        'id' => (int) $row['id'], 'project_id' => (int) $row['project_id'],
        'project_name' => (string) $row['project_name'], 'email' => (string) $row['invited_email'],
        'status' => (string) $row['status'], 'expires_at' => (new DateTimeImmutable((string) $row['expires_at'], new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s\\Z'),
        'created_at' => (new DateTimeImmutable((string) $row['created_at'], new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s\\Z'),
        'permissions' => $permissions,
    ];
}

/** Založí vlastníka aj v tabuľke členstva; vlastnícke práva sú v API vždy úplné. */
function tasko_add_project_owner(PDO $pdo, int $projectId, int $userId): void
{
    $pdo->prepare(
        'INSERT INTO project_members (project_id, user_id, can_view_project, can_manage_project, can_manage_members,
         can_view_tasks, can_add_tasks, can_complete_tasks, can_edit_own_tasks, can_edit_other_tasks,
         can_delete_own_tasks, can_delete_other_tasks, can_view_comments, can_add_comments,
         can_edit_own_comments, can_edit_other_comments, can_delete_own_comments, can_delete_other_comments)
         VALUES (:project_id, :user_id, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)'
    )->execute(['project_id' => $projectId, 'user_id' => $userId]);
}

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

/** Vráti projekt vlastníkovi alebo členovi, ktorý smie projekt zobraziť. */
function tasko_project_row(PDO $pdo, int $userId, int $projectId): array
{
    $statement = $pdo->prepare(
        'SELECT p.id, p.user_id, p.name, p.description, p.icon, p.color, pm.can_manage_project,
                COUNT(t.id) AS task_count,
                COALESCE(SUM(CASE WHEN t.is_done = 1 THEN 1 ELSE 0 END), 0) AS done_count
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
         WHERE p.id = :project_id AND (p.user_id = :owner_id OR pm.can_view_project = 1)
         GROUP BY p.id, p.name, p.description, p.icon, p.color, pm.can_manage_project'
    );
    $statement->execute(['member_id' => $userId, 'project_id' => $projectId, 'owner_id' => $userId]);
    $project = $statement->fetch();
    if (!is_array($project)) {
        throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
    }

    return [
        'id' => (int) $project['id'],
        'is_owner' => (int) $project['user_id'] === $userId,
        'can_manage_project' => (int) $project['user_id'] === $userId || (bool) $project['can_manage_project'],
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
        '/api/me/notifications' => ['GET', 'POST'],
        '/api/audit' => ['GET'],
    ];
    if (preg_match('#^/api/projects/([^/]+)$#D', $route, $projectRoute) === 1) {
        $allowedMethods[$route] = ['GET', 'PATCH', 'DELETE'];
    }
    if (preg_match('#^/api/projects/([^/]+)/transfer-ownership$#D', $route) === 1) {
        $allowedMethods[$route] = ['POST'];
    }
    if (preg_match('#^/api/projects/([^/]+)/audit$#D', $route) === 1) {
        $allowedMethods[$route] = ['GET'];
    }
    if (preg_match('#^/api/projects/([^/]+)/members$#D', $route, $membersRoute) === 1) {
        $allowedMethods[$route] = ['GET', 'PATCH', 'DELETE'];
    }
    if (preg_match('#^/api/projects/([^/]+)/invitations$#D', $route) === 1) {
        $allowedMethods[$route] = ['GET', 'POST'];
    }
    if (preg_match('#^/api/projects/([^/]+)/invitations/([^/]+)$#D', $route) === 1) {
        $allowedMethods[$route] = ['DELETE'];
    }
    if ($route === '/api/me/invitations') {
        $allowedMethods[$route] = ['GET'];
    }
    if (preg_match('#^/api/invitations/([^/]+)/(accept|decline)$#D', $route) === 1) {
        $allowedMethods[$route] = ['POST'];
    }
    if (preg_match('#^/api/tasks/([^/]+)$#D', $route, $taskRoute) === 1) {
        $allowedMethods[$route] = ['GET', 'PATCH', 'DELETE'];
    }
    if (preg_match('#^/api/tasks/([^/]+)/(complete|uncomplete)$#D', $route, $taskActionRoute) === 1) {
        $allowedMethods[$route] = ['POST'];
    }
    if (preg_match('#^/api/tasks/([^/]+)/shares(?:/([^/]+))?$#D', $route) === 1) {
        $allowedMethods[$route] = str_ends_with($route, '/shares') ? ['GET', 'POST'] : ['DELETE'];
    }
    if (preg_match('#^/api/tasks/([^/]+)/participants$#D', $route) === 1) {
        $allowedMethods[$route] = ['GET'];
    }
    if ($route === '/api/shared') $allowedMethods[$route] = ['GET'];
    if ($route === '/api/tasks/completed') {
        $allowedMethods[$route] = ['DELETE'];
    }
    if (preg_match('#^/api/tasks/([^/]+)/comments$#D', $route, $commentsRoute) === 1) {
        $allowedMethods[$route] = ['GET', 'POST'];
    }
    if (preg_match('#^/api/comments/([^/]+)$#D', $route, $commentRoute) === 1) {
        $allowedMethods[$route] = ['PATCH', 'DELETE'];
    }
    if (isset($allowedMethods[$route]) && !in_array($method, $allowedMethods[$route], true)) {
        header('Allow: ' . implode(', ', [...$allowedMethods[$route], 'OPTIONS']));
        throw new TaskoHttpException(405, 'method_not_allowed', 'Táto HTTP metóda nie je na danej ceste podporovaná.');
    }

    // Notifikácie sú vždy viazané na session používateľa; potvrdenie prijíma iba zobrazené ID.
    if ($route === '/api/me/notifications') {
        $user = tasko_authenticated_user();
        $pdo = tasko_db();
        if ($method === 'GET') {
            $before = $_GET['before'] ?? '0';
            if (!is_string($before) || !preg_match('/^(0|[1-9][0-9]{0,18})$/D', $before)) tasko_validation_error(['before' => 'Kurzor notifikácií nie je platný.']);
            $rows = tasko_user_notifications($pdo, (int) $user['id'], (int) $before, 25);
            $unread = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = :user_id AND is_read = 0');
            $unread->execute(['user_id' => (int) $user['id']]);
            tasko_json_response(200, ['items' => $rows, 'next_before' => count($rows) === 25 ? end($rows)['id'] : null, 'unread_count' => (int) $unread->fetchColumn()]);
        }
        tasko_require_same_origin();
        $input = tasko_read_json_body();
        $ids = $input['ids'] ?? null;
        if (!is_array($ids) || $ids === [] || count($ids) > 50 || array_filter($ids, static fn ($id): bool => !tasko_validate_id($id))) {
            tasko_validation_error(['ids' => 'Označ najviac 50 zobrazených notifikácií.']);
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $mark = $pdo->prepare("UPDATE notifications SET is_read = 1, read_at = UTC_TIMESTAMP() WHERE user_id = ? AND is_read = 0 AND id IN ($placeholders)");
        $mark->execute([(int) $user['id'], ...array_map('intval', $ids)]);
        $unread = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = :user_id AND is_read = 0');
        $unread->execute(['user_id' => (int) $user['id']]);
        tasko_json_response(200, ['updated' => $mark->rowCount(), 'unread_count' => (int) $unread->fetchColumn()]);
    }

    // Globálny audit spája vlastné udalosti účtu s udalosťami projektov, ktoré používateľ ešte smie zobraziť.
    if ($route === '/api/audit' && $method === 'GET') {
        $user = tasko_authenticated_user();
        $userId = (int) $user['id'];
        $before = $_GET['before'] ?? '0';
        $searchInput = $_GET['q'] ?? '';
        if (!is_string($searchInput)) tasko_validation_error(['q' => 'Vyhľadávanie musí byť text.']);
        $search = trim($searchInput);
        $type = $_GET['type'] ?? '';
        $from = $_GET['from'] ?? '';
        $to = $_GET['to'] ?? '';
        if (!is_string($before) || !preg_match('/^(0|[1-9][0-9]{0,18})$/D', $before)) tasko_validation_error(['before' => 'Kurzor auditu nie je platný.']);
        if (tasko_text_length($search) > 100) tasko_validation_error(['q' => 'Vyhľadávanie môže mať najviac 100 znakov.']);
        if (!is_string($type) || !in_array($type, ['', 'account', 'project', 'task', 'comment', 'invitation', 'membership'], true)) tasko_validation_error(['type' => 'Vyber platný typ záznamu.']);
        foreach (['from' => $from, 'to' => $to] as $field => $date) {
            if ($date !== '' && !tasko_validate_date($date)) {
                tasko_validation_error([$field => 'Zadaj platný dátum vo formáte YYYY-MM-DD.']);
            }
        }
        if ($from !== '' && $to !== '' && $from > $to) tasko_validation_error(['to' => 'Dátum do musí byť rovnaký alebo neskorší ako dátum od.']);

        $where = ['(a.actor_id = :actor_id OR (a.project_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
            WHERE p.id = a.project_id AND (p.user_id = :owner_id OR pm.can_view_project = 1)
        )))'];
        $params = ['actor_id' => $userId, 'member_id' => $userId, 'owner_id' => $userId];
        if ((int) $before > 0) { $where[] = 'a.id < :before_id'; $params['before_id'] = (int) $before; }
        if ($type !== '') { $where[] = 'a.entity_type = :entity_type'; $params['entity_type'] = $type; }
        if ($from !== '') { $where[] = 'a.created_at >= :date_from'; $params['date_from'] = $from . ' 00:00:00'; }
        if ($to !== '') { $where[] = 'a.created_at < :date_to'; $params['date_to'] = (new DateTimeImmutable($to, new DateTimeZone('UTC')))->modify('+1 day')->format('Y-m-d 00:00:00'); }
        if ($search !== '') {
            $where[] = '(u.name LIKE :search_name OR a.event_type LIKE :search_event OR a.entity_type LIKE :search_entity OR a.ip_address LIKE :search_ip OR CAST(a.details AS CHAR) LIKE :search_details)';
            foreach (['search_name', 'search_event', 'search_entity', 'search_ip', 'search_details'] as $key) $params[$key] = '%' . $search . '%';
        }
        $query = tasko_db()->prepare('SELECT a.id, a.project_id, a.entity_type, a.entity_id, a.actor_id, u.name AS actor_name, a.ip_address, a.event_type, a.details, a.created_at FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE ' . implode(' AND ', $where) . ' ORDER BY a.id DESC LIMIT 26');
        $query->execute($params);
        $rows = $query->fetchAll();
        $hasMore = count($rows) > 25;
        if ($hasMore) array_pop($rows);
        $items = array_map(static fn (array $row): array => [
            'id' => (int) $row['id'], 'project_id' => $row['project_id'] === null ? null : (int) $row['project_id'],
            'entity_type' => (string) $row['entity_type'], 'entity_id' => $row['entity_id'] === null ? null : (int) $row['entity_id'],
            'actor_name' => $row['actor_name'] === null ? null : (string) $row['actor_name'],
            'ip_address' => $row['ip_address'] === null ? null : (string) $row['ip_address'],
            'event_type' => (string) $row['event_type'], 'details' => json_decode((string) $row['details'], true) ?: [],
            'created_at' => (new DateTimeImmutable((string) $row['created_at'], new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s\\Z'),
        ], $rows);
        tasko_json_response(200, ['items' => $items, 'next_before' => $hasMore && $items !== [] ? end($items)['id'] : null]);
    }

    // Projektová história číta spoločný denník a stále vyžaduje právo zobraziť príslušný projekt.
    if (preg_match('#^/api/projects/([^/]+)/audit$#D', $route, $auditRoute) === 1 && $method === 'GET') {
        $user = tasko_authenticated_user();
        if (!tasko_validate_id($auditRoute[1])) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
        $projectId = (int) $auditRoute[1]; $pdo = tasko_db();
        $access = $pdo->prepare('SELECT 1 FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :user_id WHERE p.id = :project_id AND (p.user_id = :owner_id OR pm.can_view_project = 1)');
        $access->execute(['user_id' => (int) $user['id'], 'project_id' => $projectId, 'owner_id' => (int) $user['id']]);
        if (!$access->fetchColumn()) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
        $before = $_GET['before'] ?? '0';
        if (!is_string($before) || !preg_match('/^(0|[1-9][0-9]{0,18})$/D', $before)) tasko_validation_error(['before' => 'Kurzor auditu nie je platný.']);
        $cursor = (int) $before > 0 ? ' AND a.id < :before_id' : '';
        $query = $pdo->prepare('SELECT a.id, a.actor_id, u.name AS actor_name, a.ip_address, a.entity_type, a.entity_id, a.event_type, a.details, a.created_at FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.project_id = :project_id' . $cursor . ' ORDER BY a.id DESC LIMIT 25');
        $query->bindValue(':project_id', $projectId, PDO::PARAM_INT);
        if ((int) $before > 0) $query->bindValue(':before_id', (int) $before, PDO::PARAM_INT);
        $query->execute();
        $rows = array_map(static fn (array $row): array => ['id' => (int) $row['id'], 'actor_name' => $row['actor_name'], 'ip_address' => $row['ip_address'], 'entity_type' => $row['entity_type'], 'entity_id' => $row['entity_id'] === null ? null : (int) $row['entity_id'], 'event_type' => (string) $row['event_type'], 'details' => json_decode((string) $row['details'], true) ?: [], 'created_at' => (new DateTimeImmutable((string) $row['created_at'], new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s\\Z')], $query->fetchAll());
        tasko_json_response(200, ['items' => $rows, 'next_before' => count($rows) === 25 ? end($rows)['id'] : null]);
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
            $personalProjectId = (int) $pdo->lastInsertId();
            tasko_add_project_owner($pdo, $personalProjectId, $userId);
            tasko_record_audit_event($pdo, null, 'account', $userId, $userId, 'account_created', ['snapshot' => ['name' => $name, 'email' => $email]]);
            tasko_record_audit_event($pdo, $personalProjectId, 'project', $personalProjectId, $userId, 'project_created', ['snapshot' => ['name' => 'Osobné', 'description' => '', 'icon' => 'star']]);
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
        tasko_record_audit_event(tasko_db(), null, 'account', (int) $user['id'], (int) $user['id'], 'account_login', ['snapshot' => ['activity' => 'login']]);
        tasko_json_response(200, $_SESSION['user']);
    }

    if ($route === '/api/auth/logout' && $method === 'POST') {
        tasko_require_same_origin();
        $user = tasko_authenticated_user();
        tasko_record_audit_event(tasko_db(), null, 'account', (int) $user['id'], (int) $user['id'], 'account_logout', ['snapshot' => ['activity' => 'logout']]);
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
        $pdo = tasko_db();
        $pdo->beginTransaction();
        $update = $pdo->prepare('UPDATE users SET name = :name WHERE id = :id');
        $update->execute(['name' => $name, 'id' => $user['id']]);
        if ((string) $user['name'] !== $name) tasko_record_audit_event($pdo, null, 'account', (int) $user['id'], (int) $user['id'], 'profile_updated', ['changes' => ['name' => ['old' => (string) $user['name'], 'new' => $name]]]);
        $pdo->commit();
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
        $pdo = tasko_db();
        $pdo->beginTransaction();
        $update = $pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $update->execute(['hash' => password_hash($input['new_password'], PASSWORD_DEFAULT), 'id' => $user['id']]);
        tasko_record_audit_event($pdo, null, 'account', (int) $user['id'], (int) $user['id'], 'password_changed', ['changes' => ['password' => ['old' => '(skryté)', 'new' => '(skryté)']]]);
        $pdo->commit();
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
        $pdo = tasko_db();
        $pdo->beginTransaction();
        $update = $pdo->prepare('UPDATE users SET plan = :plan WHERE id = :id');
        $update->execute(['plan' => $input['plan'], 'id' => $user['id']]);
        if ((string) $user['plan'] !== $input['plan']) tasko_record_audit_event($pdo, null, 'account', (int) $user['id'], (int) $user['id'], 'plan_changed', ['changes' => ['plan' => ['old' => (string) $user['plan'], 'new' => $input['plan']]]]);
        $pdo->commit();
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
            $visibility = $_GET['visibility'] ?? 'all';
            if (!is_string($visibility) || !in_array($visibility, ['all', 'mine', 'shared'], true)) {
                throw new TaskoHttpException(400, 'bad_request', 'Filter visibility musí byť all, mine alebo shared.');
            }
            $visibilitySql = match ($visibility) {
                'mine' => 'p.user_id = :owner_id',
                'shared' => 'p.user_id <> :owner_id AND pm.can_view_project = 1',
                default => '(p.user_id = :owner_id OR pm.can_view_project = 1)',
            };
            $statement = $pdo->prepare(
                'SELECT p.id, p.user_id, p.name, p.description, p.icon, p.color, pm.can_manage_project,
                        COUNT(t.id) AS task_count,
                        COALESCE(SUM(CASE WHEN t.is_done = 1 THEN 1 ELSE 0 END), 0) AS done_count
                 FROM projects p
                 LEFT JOIN tasks t ON t.project_id = p.id
                 LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
                 WHERE ' . $visibilitySql . '
                 GROUP BY p.id, p.name, p.description, p.icon, p.color, pm.can_manage_project
                 ORDER BY p.id'
            );
            $statement->execute(['member_id' => $userId, 'owner_id' => $userId]);
            $projects = array_map(static fn (array $project): array => [
                'id' => (int) $project['id'],
                'is_owner' => (int) $project['user_id'] === $userId,
                'can_manage_project' => (int) $project['user_id'] === $userId || (bool) $project['can_manage_project'],
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
            tasko_add_project_owner($pdo, $projectId, $userId);
            tasko_record_audit_event($pdo, $projectId, 'project', $projectId, $userId, 'project_created', ['snapshot' => ['name' => $name, 'description' => $description, 'icon' => $icon, 'color' => $color]]);
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

    // Členovia sa načítajú cez samostatnú cestu a kontrolu prístupu vykoná SQL.
    if (preg_match('#^/api/projects/([^/]+)/members$#D', $route, $membersRoute) === 1 && $method === 'GET') {
        $user = tasko_authenticated_user();
        if (!tasko_validate_id($membersRoute[1])) {
            throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
        }
        tasko_json_response(200, tasko_project_members(tasko_db(), (int) $membersRoute[1], (int) $user['id']));
    }

    if (preg_match('#^/api/projects/([^/]+)/members$#D', $route, $membersRoute) === 1 && in_array($method, ['PATCH', 'DELETE'], true)) {
        tasko_require_same_origin();
        $user = tasko_authenticated_user();
        if (!tasko_validate_id($membersRoute[1])) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
        $pdo = tasko_db(); $projectId = (int) $membersRoute[1]; $managerId = (int) $user['id'];
        $ownerId = tasko_require_project_member_manager($pdo, $projectId, $managerId);
        $input = tasko_read_json_body();
        if (!tasko_validate_id($input['user_id'] ?? null)) tasko_validation_error(['user_id' => 'Vyber platného člena.']);
        $memberId = (int) $input['user_id'];
        if ($memberId === $ownerId) throw new TaskoHttpException(403, 'owner_immutable', 'Oprávnenia vlastníka sa nemenia cez správu členov.');
        $memberSnapshot = null;
        foreach (tasko_project_members($pdo, $projectId, $managerId) as $member) {
            if ((int) $member['id'] === $memberId) { $memberSnapshot = $member; break; }
        }
        $exists = $pdo->prepare('SELECT 1 FROM project_members WHERE project_id = :project_id AND user_id = :user_id');
        $exists->execute(['project_id' => $projectId, 'user_id' => $memberId]);
        if (!$exists->fetchColumn()) throw new TaskoHttpException(404, 'not_found', 'Člen sa nenašiel.');
        if ($method === 'DELETE') {
            $pdo->beginTransaction();
            try {
                $delete = $pdo->prepare('DELETE FROM project_members WHERE project_id = :project_id AND user_id = :user_id');
                $delete->execute(['project_id' => $projectId, 'user_id' => $memberId]);
                tasko_record_project_event($pdo, $projectId, $managerId, 'member_removed', ['member_id' => $memberId, 'member_name' => $memberSnapshot['name'] ?? null, 'permissions' => $memberSnapshot['permissions'] ?? []], [$memberId]);
                $pdo->commit();
            } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
            tasko_json_response(204);
        }
        $unknown = array_diff(array_keys($input), ['user_id', ...tasko_project_permission_fields()]);
        if ($unknown !== []) tasko_validation_error(['permissions' => 'Požiadavka obsahuje neznáme oprávnenia.']);
        $values = [];
        foreach (tasko_project_permission_fields() as $field) {
            if (!is_bool($input[$field] ?? null)) tasko_validation_error([$field => 'Oprávnenie musí byť true alebo false.']);
            $values[$field] = $input[$field] ? 1 : 0;
        }
        $assignments = array_map(static fn (string $field): string => "`$field` = :$field", array_keys($values));
        $values += ['project_id' => $projectId, 'user_id' => $memberId];
        $permissionChanges = [];
        foreach (tasko_project_permission_fields() as $field) {
            $old = (bool) ($memberSnapshot['permissions'][$field] ?? false);
            $new = (bool) $values[$field];
            if ($old !== $new) $permissionChanges[$field] = ['old' => $old, 'new' => $new];
        }
        $pdo->beginTransaction();
        try {
            $update = $pdo->prepare('UPDATE project_members SET ' . implode(', ', $assignments) . ' WHERE project_id = :project_id AND user_id = :user_id');
            $update->execute($values);
            if ($permissionChanges !== []) tasko_record_project_event($pdo, $projectId, $managerId, 'permissions_changed', ['member_id' => $memberId, 'member_name' => $memberSnapshot['name'] ?? null, 'changes' => $permissionChanges], [$memberId]);
            $pdo->commit();
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
        tasko_json_response(200, tasko_project_members($pdo, $projectId, $managerId));
    }

    if (preg_match('#^/api/projects/([^/]+)/invitations$#D', $route, $invitationListRoute) === 1 && in_array($method, ['GET', 'POST'], true)) {
        $user = tasko_authenticated_user();
        if (!tasko_validate_id($invitationListRoute[1])) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
        $pdo = tasko_db(); $projectId = (int) $invitationListRoute[1]; $userId = (int) $user['id'];
        tasko_require_project_member_manager($pdo, $projectId, $userId);
        if ($method === 'GET') {
            $expire = $pdo->prepare("UPDATE project_invitations SET status = 'expired', responded_at = UTC_TIMESTAMP() WHERE project_id = :project_id AND status = 'pending' AND expires_at <= UTC_TIMESTAMP()");
            $expire->execute(['project_id' => $projectId]);
            $query = $pdo->prepare('SELECT i.*, p.name AS project_name FROM project_invitations i INNER JOIN projects p ON p.id = i.project_id WHERE i.project_id = :project_id ORDER BY i.created_at DESC');
            $query->execute(['project_id' => $projectId]);
            tasko_json_response(200, array_map('tasko_invitation_row', $query->fetchAll()));
        }
        tasko_require_same_origin();
        $input = tasko_read_json_body();
        $email = tasko_validate_email($input['email'] ?? null);
        if ($email === null) tasko_validation_error(['email' => 'Zadaj platnú e-mailovú adresu.']);
        if (strcasecmp($email, (string) $user['email']) === 0) tasko_validation_error(['email' => 'Svoj účet už vlastníš v tomto projekte.']);
        $permissions = [];
        foreach (tasko_project_permission_fields() as $field) {
            if (!is_bool($input[$field] ?? null)) tasko_validation_error([$field => 'Vyber každé oprávnenie ako true alebo false.']);
            $permissions[$field] = $input[$field] ? 1 : 0;
        }
        if (!$permissions['can_view_project']) tasko_validation_error(['can_view_project' => 'Pozvaný člen musí mať právo zobraziť projekt.']);
        // Zámok projektu serializuje kontrolu duplicít aj súbežné vytváranie pozvánok.
        $pdo->beginTransaction();
        try {
            $projectLock = $pdo->prepare('SELECT id FROM projects WHERE id = :id FOR UPDATE');
            $projectLock->execute(['id' => $projectId]);
            if (!$projectLock->fetchColumn()) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
        $invitee = $pdo->prepare('SELECT id FROM users WHERE email = :email'); $invitee->execute(['email' => $email]);
        $inviteeId = $invitee->fetchColumn();
        if ($inviteeId !== false) {
            $member = $pdo->prepare('SELECT 1 FROM project_members WHERE project_id = :project_id AND user_id = :user_id');
            $member->execute(['project_id' => $projectId, 'user_id' => (int) $inviteeId]);
            if ($member->fetchColumn()) throw new TaskoHttpException(409, 'already_member', 'Tento účet už je členom projektu.');
        }
        $duplicate = $pdo->prepare("SELECT id FROM project_invitations WHERE project_id = :project_id AND invited_email = :email AND status = 'pending' AND expires_at > UTC_TIMESTAMP() LIMIT 1");
        $duplicate->execute(['project_id' => $projectId, 'email' => $email]);
        if ($duplicate->fetchColumn()) throw new TaskoHttpException(409, 'invitation_pending', 'Pre tento e-mail už čaká platná pozvánka.');
        $token = bin2hex(random_bytes(32)); $tokenHash = hash('sha256', $token);
        $fields = array_keys($permissions); $columns = implode(', ', array_map(static fn (string $field): string => "`$field`", $fields));
        $params = implode(', ', array_map(static fn (string $field): string => ":$field", $fields));
        $insert = $pdo->prepare("INSERT INTO project_invitations (project_id, invited_email, invited_user_id, invited_by, token_hash, expires_at, $columns) VALUES (:project_id, :email, :invitee_id, :invited_by, :token_hash, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), $params)");
        $insert->execute($permissions + ['project_id' => $projectId, 'email' => $email, 'invitee_id' => $inviteeId === false ? null : (int) $inviteeId, 'invited_by' => $userId, 'token_hash' => $tokenHash]);
        $invitationId = (int) $pdo->lastInsertId();
        tasko_record_project_event($pdo, $projectId, $userId, 'invitation_created', ['invitation_id' => $invitationId, 'invited_user_id' => $inviteeId === false ? null : (int) $inviteeId, 'email' => $email], $inviteeId === false ? [] : [(int) $inviteeId]);
        $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        tasko_json_response(201, ['id' => $invitationId, 'email' => $email, 'status' => 'pending', 'expires_at' => gmdate('Y-m-d\\TH:i:s\\Z', time() + 7 * 86400), 'token' => $token]);
    }

    if (preg_match('#^/api/projects/([^/]+)/invitations/([^/]+)$#D', $route, $invitationRevokeRoute) === 1 && $method === 'DELETE') {
        tasko_require_same_origin(); $user = tasko_authenticated_user();
        if (!tasko_validate_id($invitationRevokeRoute[1]) || !tasko_validate_id($invitationRevokeRoute[2])) throw new TaskoHttpException(404, 'not_found', 'Pozvánka sa nenašla.');
        $pdo = tasko_db(); $projectId = (int) $invitationRevokeRoute[1]; tasko_require_project_member_manager($pdo, $projectId, (int) $user['id']);
        $pdo->beginTransaction();
        try {
            $find = $pdo->prepare("SELECT invited_user_id FROM project_invitations WHERE id = :id AND project_id = :project_id AND status = 'pending' FOR UPDATE");
            $find->execute(['id' => (int) $invitationRevokeRoute[2], 'project_id' => $projectId]);
            $inviteeId = $find->fetchColumn();
            if ($inviteeId === false) throw new TaskoHttpException(404, 'not_found', 'Aktívna pozvánka sa nenašla.');
            $update = $pdo->prepare("UPDATE project_invitations SET status = 'revoked', responded_at = UTC_TIMESTAMP() WHERE id = :id AND project_id = :project_id");
            $update->execute(['id' => (int) $invitationRevokeRoute[2], 'project_id' => $projectId]);
            tasko_record_project_event($pdo, $projectId, (int) $user['id'], 'invitation_revoked', ['invitation_id' => (int) $invitationRevokeRoute[2]], $inviteeId === null ? [] : [(int) $inviteeId]);
            $pdo->commit();
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
        tasko_json_response(204);
    }

    if ($route === '/api/me/invitations' && $method === 'GET') {
        $user = tasko_authenticated_user(); $pdo = tasko_db();
        $pdo->prepare("UPDATE project_invitations SET status = 'expired', responded_at = UTC_TIMESTAMP() WHERE invited_email = :email AND status = 'pending' AND expires_at <= UTC_TIMESTAMP()")->execute(['email' => $user['email']]);
        $query = $pdo->prepare("SELECT i.*, p.name AS project_name FROM project_invitations i INNER JOIN projects p ON p.id = i.project_id WHERE i.invited_email = :email AND i.status = 'pending' AND i.expires_at > UTC_TIMESTAMP() ORDER BY i.created_at DESC");
        $query->execute(['email' => $user['email']]);
        tasko_json_response(200, array_map('tasko_invitation_row', $query->fetchAll()));
    }

    if (preg_match('#^/api/invitations/([^/]+)/(accept|decline)$#D', $route, $invitationActionRoute) === 1 && $method === 'POST') {
        tasko_require_same_origin(); $user = tasko_authenticated_user(); $input = tasko_read_json_body();
        $token = $input['token'] ?? null;
        if (!tasko_validate_id($invitationActionRoute[1]) || !is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) throw new TaskoHttpException(404, 'not_found', 'Pozvánka sa nenašla.');
        $pdo = tasko_db();
        try {
            $pdo->beginTransaction();
            $query = $pdo->prepare('SELECT * FROM project_invitations WHERE id = :id FOR UPDATE'); $query->execute(['id' => (int) $invitationActionRoute[1]]); $invitation = $query->fetch();
            if (!is_array($invitation) || !hash_equals((string) $invitation['token_hash'], hash('sha256', $token))) throw new TaskoHttpException(404, 'not_found', 'Pozvánka sa nenašla.');
            if (strcasecmp((string) $invitation['invited_email'], (string) $user['email']) !== 0) throw new TaskoHttpException(403, 'wrong_account', 'Pozvánku môže spracovať iba účet pozvaný na tento e-mail.');
            if ($invitation['invited_user_id'] !== null && (int) $invitation['invited_user_id'] !== (int) $user['id']) throw new TaskoHttpException(403, 'wrong_account', 'Pozvánka patrí inému používateľskému účtu.');
            if ($invitation['status'] !== 'pending') throw new TaskoHttpException(409, 'invitation_inactive', 'Pozvánka už nie je aktívna.');
            if (strtotime((string) $invitation['expires_at'] . ' UTC') <= time()) {
                $pdo->prepare("UPDATE project_invitations SET status = 'expired', responded_at = UTC_TIMESTAMP() WHERE id = :id")->execute(['id' => (int) $invitation['id']]);
                $pdo->commit(); throw new TaskoHttpException(409, 'invitation_expired', 'Platnosť pozvánky vypršala.');
            }
            if ($invitationActionRoute[2] === 'accept') {
                $existing = $pdo->prepare('SELECT 1 FROM project_members WHERE project_id = :project_id AND user_id = :user_id');
                $existing->execute(['project_id' => (int) $invitation['project_id'], 'user_id' => (int) $user['id']]);
                if (!$existing->fetchColumn()) {
                    $permissionFields = tasko_project_permission_fields();
                    $columns = implode(', ', array_map(static fn (string $field): string => "`$field`", $permissionFields));
                    $values = implode(', ', array_map(static fn (string $field): string => ":$field", $permissionFields));
                    // PDO potrebuje pomenované kľúče zhodné s placeholdermi, nie číselné indexy.
                    $params = array_combine($permissionFields, array_map(static fn (string $field): int => (int) $invitation[$field], $permissionFields));
                    $pdo->prepare("INSERT INTO project_members (project_id, user_id, $columns) VALUES (:project_id, :user_id, $values)")->execute($params + ['project_id' => (int) $invitation['project_id'], 'user_id' => (int) $user['id']]);
                }
            }
            $status = $invitationActionRoute[2] === 'accept' ? 'accepted' : 'declined';
            $pdo->prepare('UPDATE project_invitations SET status = :status, invited_user_id = :user_id, responded_at = UTC_TIMESTAMP() WHERE id = :id')->execute(['status' => $status, 'user_id' => (int) $user['id'], 'id' => (int) $invitation['id']]);
            if ($status === 'accepted') {
                $ownerQuery = $pdo->prepare('SELECT user_id FROM projects WHERE id = :project_id');
                $ownerQuery->execute(['project_id' => (int) $invitation['project_id']]);
                $ownerId = (int) $ownerQuery->fetchColumn();
                tasko_record_project_event($pdo, (int) $invitation['project_id'], (int) $user['id'], 'invitation_accepted', ['invitation_id' => (int) $invitation['id'], 'member_id' => (int) $user['id'], 'email' => (string) $invitation['invited_email']], [$ownerId]);
            } else tasko_record_project_event($pdo, (int) $invitation['project_id'], (int) $user['id'], 'invitation_declined', ['invitation_id' => (int) $invitation['id'], 'email' => (string) $invitation['invited_email']]);
            $pdo->commit();
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
        tasko_json_response(200, ['status' => $status, 'project_id' => (int) $invitation['project_id']]);
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
            tasko_require_project_permission($pdo, $projectId, $userId, 'can_manage_project');
            $currentProject = tasko_project_row($pdo, $userId, $projectId);
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
            $pdo->beginTransaction();
            try {
                $update = $pdo->prepare('UPDATE projects SET ' . implode(', ', $assignments) . ' WHERE id = :project_id AND user_id = :user_id');
                $update->execute($values);
                $changes = [];
                foreach ($values as $field => $value) {
                    if (in_array($field, ['project_id', 'user_id'], true)) continue;
                    if (($currentProject[$field] ?? null) !== $value) $changes[$field] = ['old' => $currentProject[$field] ?? null, 'new' => $value];
                }
                if ($changes !== []) tasko_record_audit_event($pdo, $projectId, 'project', $projectId, $userId, 'project_updated', ['changes' => $changes]);
                $pdo->commit();
            } catch (PDOException $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                if (($error->errorInfo[1] ?? null) === 1062) {
                    throw new TaskoHttpException(409, 'name_taken', 'Projekt s týmto názvom už existuje.');
                }
                throw $error;
            }
            tasko_json_response(200, tasko_project_row($pdo, $userId, $projectId));
        }

        if ($method === 'DELETE') {
            tasko_require_same_origin();
            tasko_require_project_permission($pdo, $projectId, $userId, 'can_manage_project');
            try {
                $pdo->beginTransaction();
                // Rovnaký zámok ako pri vytvorení bráni súbehu mazania a vytvárania.
                $lock = $pdo->prepare('SELECT id FROM users WHERE id = :id FOR UPDATE');
                $lock->execute(['id' => $userId]);
                if ($lock->fetchColumn() === false) throw new TaskoHttpException(401, 'unauthenticated', 'Prihlásenie je potrebné.');
                $owned = $pdo->prepare('SELECT id, user_id, name, description, icon, color FROM projects WHERE id = :id FOR UPDATE');
            $owned->execute(['id' => $projectId]);
                $lockedProject = $owned->fetch();
                if (!is_array($lockedProject)) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
                if ((int) $lockedProject['user_id'] === $userId) {
                    $count = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = :user_id');
                    $count->execute(['user_id' => $userId]);
                    if ((int) $count->fetchColumn() <= 1) {
                        throw new TaskoHttpException(409, 'last_project', 'Posledný projekt nemožno zmazať.');
                    }
                }
                $projectTasks = $pdo->prepare('SELECT id, title, description, priority, due_date, is_done FROM tasks WHERE project_id = :project_id');
                $projectTasks->execute(['project_id' => $projectId]);
                $taskSnapshots = $projectTasks->fetchAll();
                $projectComments = $pdo->prepare('SELECT c.id, c.task_id, c.parent_id, c.body FROM comments c INNER JOIN tasks t ON t.id = c.task_id WHERE t.project_id = :project_id');
                $projectComments->execute(['project_id' => $projectId]);
                $commentSnapshots = $projectComments->fetchAll();
                foreach ($taskSnapshots as $taskSnapshot) tasko_record_audit_event($pdo, $projectId, 'task', (int) $taskSnapshot['id'], $userId, 'task_deleted', ['snapshot' => ['title' => $taskSnapshot['title'], 'description' => $taskSnapshot['description'], 'priority' => (int) $taskSnapshot['priority'], 'due_date' => $taskSnapshot['due_date'], 'is_done' => (bool) $taskSnapshot['is_done'], 'reason' => 'project_deleted']]);
                foreach ($commentSnapshots as $commentSnapshot) tasko_record_audit_event($pdo, $projectId, 'comment', (int) $commentSnapshot['id'], $userId, 'comment_deleted', ['snapshot' => ['task_id' => (int) $commentSnapshot['task_id'], 'parent_id' => $commentSnapshot['parent_id'] === null ? null : (int) $commentSnapshot['parent_id'], 'body' => $commentSnapshot['body'], 'reason' => 'project_deleted']]);
                tasko_record_audit_event($pdo, $projectId, 'project', $projectId, $userId, 'project_deleted', ['snapshot' => ['name' => $lockedProject['name'], 'description' => $lockedProject['description'], 'icon' => $lockedProject['icon'], 'color' => $lockedProject['color'], 'task_count' => count($taskSnapshots), 'comment_count' => count($commentSnapshots)]]);
                $delete = $pdo->prepare('DELETE FROM projects WHERE id = :id');
                $delete->execute(['id' => $projectId]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            tasko_json_response(204);
        }
    }

    if (preg_match('#^/api/projects/([^/]+)/transfer-ownership$#D', $route, $transferRoute) === 1 && $method === 'POST') {
        $user = tasko_authenticated_user();
        tasko_require_same_origin();
        if (!tasko_validate_id($transferRoute[1])) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašlo.');
        $input = tasko_read_json_body();
        $newOwnerId = $input['user_id'] ?? null;
        $projectName = tasko_validate_name($input['name'] ?? null, 40);
        $transferFields = [];
        if (!tasko_validate_id($newOwnerId)) $transferFields['user_id'] = 'Vyber platného člena projektu.';
        if (($input['confirmed'] ?? null) !== true) $transferFields['confirmed'] = 'Potvrď prevod vlastníctva.';
        if ($projectName === null) $transferFields['name'] = 'Názov projektu musí mať 1 až 40 znakov.';
        if ($transferFields !== []) {
            tasko_validation_error($transferFields);
        }
        $pdo = tasko_db(); $projectId = (int) $transferRoute[1]; $oldOwnerId = (int) $user['id']; $newOwnerId = (int) $newOwnerId;
        try {
            $pdo->beginTransaction();
            $project = $pdo->prepare('SELECT user_id FROM projects WHERE id = :id FOR UPDATE');
            $project->execute(['id' => $projectId]);
            $currentOwner = $project->fetchColumn();
            if ($currentOwner === false) throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašlo.');
            if ((int) $currentOwner !== $oldOwnerId) throw new TaskoHttpException(403, 'forbidden', 'Prevod môže potvrdiť iba súčasný vlastník.');
            if ($newOwnerId === $oldOwnerId) throw new TaskoHttpException(422, 'validation_error', 'Novým vlastníkom musí byť iný člen.');
            $member = $pdo->prepare('SELECT 1 FROM project_members WHERE project_id = :project_id AND user_id = :user_id FOR UPDATE');
            $member->execute(['project_id' => $projectId, 'user_id' => $newOwnerId]);
            if (!$member->fetchColumn()) throw new TaskoHttpException(422, 'validation_error', 'Novým vlastníkom môže byť iba existujúci člen projektu.');
            $target = $pdo->prepare('SELECT plan FROM users WHERE id = :id FOR UPDATE');
            $target->execute(['id' => $newOwnerId]);
            $targetPlan = $target->fetchColumn();
            if (!is_string($targetPlan)) throw new TaskoHttpException(422, 'validation_error', 'Účet nového vlastníka sa nenašiel.');
            // Prevod pridá projekt do vlastníctva príjemcu, preto musí dodržať jeho limit aj unikátny názov.
            $capacity = tasko_project_limit($targetPlan);
            if ($capacity !== null) {
                $count = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = :user_id');
                $count->execute(['user_id' => $newOwnerId]);
                if ((int) $count->fetchColumn() >= $capacity) {
                    throw new TaskoHttpException(409, 'plan_limit', 'Nový vlastník dosiahol limit projektov svojho plánu.');
                }
            }
            $duplicateName = $pdo->prepare('SELECT 1 FROM projects WHERE user_id = :user_id AND name = :name AND id <> :project_id');
            $duplicateName->execute(['user_id' => $newOwnerId, 'name' => $projectName, 'project_id' => $projectId]);
            if ($duplicateName->fetchColumn()) {
                throw new TaskoHttpException(409, 'name_taken', 'Nový vlastník už má projekt s týmto názvom. Zmeň názov projektu pred prevodom.');
            }
            $permissionFields = tasko_project_permission_fields();
            $unknown = array_diff(array_keys($input), ['user_id', 'confirmed', 'name', ...$permissionFields]);
            if ($unknown !== []) tasko_validation_error(['permissions' => 'Požiadavka obsahuje neznáme oprávnenia.']);
            foreach ($permissionFields as $field) if (!is_bool($input[$field] ?? null)) tasko_validation_error([$field => 'Nastav oprávnenia pôvodného vlastníka.']);
            $assignments = implode(', ', array_map(static fn (string $field): string => "`$field` = :$field", $permissionFields));
            $values = array_map(static fn (string $field): int => (int) $input[$field], $permissionFields);
            $values += ['project_id' => $projectId, 'user_id' => $oldOwnerId];
            $pdo->prepare("UPDATE project_members SET $assignments WHERE project_id = :project_id AND user_id = :user_id")->execute($values);
            $pdo->prepare('UPDATE projects SET user_id = :new_owner, name = :name WHERE id = :id')->execute(['new_owner' => $newOwnerId, 'name' => $projectName, 'id' => $projectId]);
            tasko_record_project_event($pdo, $projectId, $oldOwnerId, 'ownership_transferred', ['changes' => ['owner_id' => ['old' => $oldOwnerId, 'new' => $newOwnerId]]], [$newOwnerId]);
            $pdo->commit();
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
        tasko_json_response(200, tasko_project_row($pdo, $newOwnerId, $projectId));
    }

    // Zdieľanie úlohy mení iba prístup k danému záznamu; projektové práva ostávajú oddelené.
    if (preg_match('#^/api/tasks/([^/]+)/shares(?:/([^/]+))?$#D', $route, $shareRoute) === 1 && in_array($method, ['GET', 'POST', 'DELETE'], true)) {
        $user = tasko_authenticated_user();
        if ($method !== 'GET') tasko_require_same_origin();
        if (!tasko_validate_id($shareRoute[1])) throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
        $pdo = tasko_db();
        $task = tasko_task_find($pdo, (int) $user['id'], (int) $shareRoute[1]);
        $manager = $pdo->prepare('SELECT p.user_id, pm.can_manage_project FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :user_id WHERE p.id = :project_id');
        $manager->execute(['user_id' => (int) $user['id'], 'project_id' => (int) $task['project_id']]);
        $managerRow = $manager->fetch() ?: [];
        $canManage = (int) ($managerRow['user_id'] ?? 0) === (int) $user['id'] || (bool) ($managerRow['can_manage_project'] ?? false) || (int) $task['created_by'] === (int) $user['id'];
        if (!$canManage) throw new TaskoHttpException(403, 'forbidden', 'Zdieľanie tejto úlohy môže spravovať jej tvorca alebo správca projektu.');
        if ($method === 'GET') {
            $list = $pdo->prepare('SELECT s.user_id, u.name, u.email, s.can_view, s.can_edit, s.can_delete, s.can_complete, s.can_view_comments, s.can_add_comments, s.can_edit_own_comments, s.can_edit_other_comments, s.can_delete_own_comments, s.can_delete_other_comments FROM task_shares s INNER JOIN users u ON u.id = s.user_id WHERE s.task_id = :task_id ORDER BY u.name');
            $list->execute(['task_id' => (int) $task['id']]);
            $rights = ['can_view', 'can_edit', 'can_delete', 'can_complete', 'can_view_comments', 'can_add_comments', 'can_edit_own_comments', 'can_edit_other_comments', 'can_delete_own_comments', 'can_delete_other_comments'];
            $rows = array_map(static function (array $row) use ($rights): array { foreach ($rights as $key) $row[$key] = (bool) $row[$key]; $row['user_id'] = (int) $row['user_id']; return $row; }, $list->fetchAll());
            tasko_json_response(200, $rows);
        }
        if ($method === 'DELETE') {
            if (!isset($shareRoute[2]) || !tasko_validate_id($shareRoute[2])) throw new TaskoHttpException(404, 'not_found', 'Zdieľanie sa nenašlo.');
            $pdo->beginTransaction();
            $remove = $pdo->prepare('DELETE FROM task_shares WHERE task_id = :task_id AND user_id = :user_id');
            $remove->execute(['task_id' => (int) $task['id'], 'user_id' => (int) $shareRoute[2]]);
            if ($remove->rowCount() > 0) tasko_record_audit_event($pdo, (int) $task['project_id'], 'task_share', (int) $task['id'], (int) $user['id'], 'task_share_revoked', ['recipient_id' => (int) $shareRoute[2]]);
            $pdo->commit();
            tasko_json_response(204);
        }
        $input = tasko_read_json_body();
        $allowed = ['can_view', 'can_edit', 'can_delete', 'can_complete', 'can_view_comments', 'can_add_comments', 'can_edit_own_comments', 'can_edit_other_comments', 'can_delete_own_comments', 'can_delete_other_comments'];
        $unknown = array_diff(array_keys($input), ['email', ...$allowed]);
        $email = filter_var($input['email'] ?? null, FILTER_VALIDATE_EMAIL);
        $errors = [];
        if ($unknown !== []) $errors['share'] = 'Požiadavka obsahuje nepovolené polia.';
        if (!is_string($email)) $errors['email'] = 'Zadaj platný e-mail existujúceho účtu.';
        $permissions = ['can_view' => true];
        foreach (array_slice($allowed, 1) as $field) {
            $value = $input[$field] ?? false;
            if (!is_bool($value)) $errors[$field] = 'Oprávnenie musí byť zapnuté alebo vypnuté.';
            $permissions[$field] = $value;
        }
        if (array_key_exists('can_view', $input) && $input['can_view'] !== true) $errors['can_view'] = 'Zdieľaná úloha musí byť viditeľná.';
        if ($errors !== []) tasko_validation_error($errors);
        $recipient = $pdo->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(:email)');
        $recipient->execute(['email' => $email]);
        $recipientId = (int) ($recipient->fetchColumn() ?: 0);
        if ($recipientId === 0 || $recipientId === (int) $user['id']) throw new TaskoHttpException(422, 'validation_failed', 'Vyber iný e-mail existujúceho účtu.');
        $columns = implode(', ', array_keys($permissions));
        $values = implode(', ', array_map(static fn (string $key): string => ':' . $key, array_keys($permissions)));
        $updates = implode(', ', array_map(static fn (string $key): string => "$key = VALUES($key)", array_keys($permissions)));
        $pdo->beginTransaction();
        $pdo->prepare("INSERT INTO task_shares (task_id, user_id, shared_by, $columns) VALUES (:task_id, :user_id, :shared_by, $values) ON DUPLICATE KEY UPDATE $updates, shared_by = VALUES(shared_by)")
            ->execute($permissions + ['task_id' => (int) $task['id'], 'user_id' => $recipientId, 'shared_by' => (int) $user['id']]);
        tasko_record_audit_event($pdo, (int) $task['project_id'], 'task_share', (int) $task['id'], (int) $user['id'], 'task_shared', ['recipient_id' => $recipientId, 'permissions' => $permissions]);
        $pdo->commit();
        tasko_json_response(200, ['user_id' => $recipientId, 'email' => $email] + $permissions);
    }

    if (preg_match('#^/api/tasks/([^/]+)/participants$#D', $route, $participantsRoute) === 1 && $method === 'GET') {
        $user = tasko_authenticated_user();
        if (!tasko_validate_id($participantsRoute[1])) throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
        $pdo = tasko_db();
        $task = tasko_task_find($pdo, (int) $user['id'], (int) $participantsRoute[1]);
        tasko_require_task_right($pdo, (int) $task['id'], (int) $user['id'], 'edit');
        $members = $pdo->prepare('SELECT DISTINCT u.id, u.name FROM users u WHERE u.id = (SELECT user_id FROM projects WHERE id = :owner_project) OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = :member_project AND pm.user_id = u.id AND pm.can_view_tasks = 1) OR EXISTS (SELECT 1 FROM task_shares ts WHERE ts.task_id = :share_task AND ts.user_id = u.id AND ts.can_view = 1) ORDER BY u.name');
        $members->execute(['owner_project' => (int) $task['project_id'], 'member_project' => (int) $task['project_id'], 'share_task' => (int) $task['id']]);
        tasko_json_response(200, array_map(static fn (array $member): array => ['id' => (int) $member['id'], 'name' => (string) $member['name']], $members->fetchAll()));
    }

    if ($route === '/api/shared' && $method === 'GET') {
        $user = tasko_authenticated_user();
        $pdo = tasko_db();
        $projects = $pdo->prepare('SELECT p.id, p.name, p.icon, p.color FROM projects p INNER JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = :user_id AND p.user_id <> :owner_id AND pm.can_view_project = 1 ORDER BY p.name');
        $projects->execute(['user_id' => (int) $user['id'], 'owner_id' => (int) $user['id']]);
        $tasks = $pdo->prepare('SELECT t.id, t.title, t.due_date FROM task_shares s INNER JOIN tasks t ON t.id = s.task_id WHERE s.user_id = :user_id ORDER BY t.due_date, t.id');
        $tasks->execute(['user_id' => (int) $user['id']]);
        $sharedTasks = array_map(static fn (array $task): array => ['id' => (int) $task['id'], 'title' => (string) $task['title'], 'due_date' => (string) $task['due_date']], $tasks->fetchAll());
        tasko_json_response(200, ['projects' => $projects->fetchAll(), 'tasks' => $sharedTasks]);
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

            $pdo = tasko_db();
            tasko_require_project_permission($pdo, (int) $projectId, (int) $user['id'], 'can_add_tasks');

            $insert = $pdo->prepare(
                'INSERT INTO tasks (project_id, created_by, title, description, priority, due_date)
                 VALUES (:project_id, :created_by, :title, :description, :priority, :due_date)'
            );
            $pdo->beginTransaction();
            $insert->execute([
                'project_id' => (int) $projectId,
                'created_by' => (int) $user['id'],
                'title' => $title,
                'description' => $description,
                'priority' => (int) $priority,
                'due_date' => $dueDate,
            ]);
            $taskId = (int) $pdo->lastInsertId();
            tasko_record_audit_event($pdo, (int) $projectId, 'task', $taskId, (int) $user['id'], 'task_created', ['snapshot' => ['title' => $title, 'description' => $description, 'priority' => (int) $priority, 'due_date' => $dueDate]]);
            $pdo->commit();
            tasko_json_response(201, tasko_task_find($pdo, (int) $user['id'], $taskId));
        }

        $filters = tasko_task_filters($_GET);
        tasko_json_response(200, tasko_tasks_find(tasko_db(), (int) $user['id'], $filters));
    }

    if ($route === '/api/tasks/completed' && $method === 'DELETE') {
        $user = tasko_authenticated_user();
        tasko_require_same_origin();
        // Hromadné odstránenie sa vždy obmedzuje na hotové úlohy projektov aktuálneho účtu.
        $pdo = tasko_db();
        $pdo->beginTransaction();
        try {
        $completed = $pdo->prepare(
            'SELECT t.id, t.project_id, t.title, t.description, t.priority, t.due_date, t.is_done
             FROM tasks t INNER JOIN projects p ON p.id = t.project_id
             WHERE p.user_id = :user_id AND t.is_done = 1'
        );
        $completed->execute(['user_id' => (int) $user['id']]);
        $snapshots = $completed->fetchAll();
        $comments = $pdo->prepare(
            'SELECT c.id, c.task_id, c.parent_id, c.body, t.project_id
             FROM comments c INNER JOIN tasks t ON t.id = c.task_id INNER JOIN projects p ON p.id = t.project_id
             WHERE p.user_id = :user_id AND t.is_done = 1'
        );
        $comments->execute(['user_id' => (int) $user['id']]);
        $commentSnapshots = $comments->fetchAll();
        $delete = $pdo->prepare(
            'DELETE t FROM tasks t
             INNER JOIN projects p ON p.id = t.project_id
             WHERE p.user_id = :user_id AND t.is_done = 1'
        );
        $delete->execute(['user_id' => (int) $user['id']]);
        foreach ($commentSnapshots as $snapshot) tasko_record_audit_event($pdo, (int) $snapshot['project_id'], 'comment', (int) $snapshot['id'], (int) $user['id'], 'comment_deleted', ['snapshot' => ['task_id' => (int) $snapshot['task_id'], 'parent_id' => $snapshot['parent_id'] === null ? null : (int) $snapshot['parent_id'], 'body' => $snapshot['body'], 'reason' => 'bulk_completed_cleanup']]);
        foreach ($snapshots as $snapshot) tasko_record_audit_event($pdo, (int) $snapshot['project_id'], 'task', (int) $snapshot['id'], (int) $user['id'], 'task_deleted', ['snapshot' => ['title' => $snapshot['title'], 'description' => $snapshot['description'], 'priority' => (int) $snapshot['priority'], 'due_date' => $snapshot['due_date'], 'is_done' => true, 'reason' => 'bulk_completed_cleanup']]);
        $pdo->commit();
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
        tasko_json_response(200, ['deleted' => $delete->rowCount()]);
    }

    if (preg_match('#^/api/tasks/([^/]+)/comments$#D', $route, $commentsRoute) === 1 && in_array($method, ['GET', 'POST'], true)) {
        $user = tasko_authenticated_user();
        tasko_require_comment_access((string) $user['plan']);
        if (!tasko_validate_id($commentsRoute[1])) {
            throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
        }
        $userId = (int) $user['id'];
        $taskId = (int) $commentsRoute[1];
        $pdo = tasko_db();
        $task = tasko_task_find($pdo, $userId, $taskId);
        tasko_require_task_right($pdo, $taskId, $userId, 'view_comments');

        if ($method === 'GET') {
            tasko_json_response(200, tasko_comments_find($pdo, $taskId, $userId));
        }

        tasko_require_same_origin();
        tasko_require_task_right($pdo, $taskId, $userId, 'add_comments');
        $input = tasko_read_json_body();
        $unknown = array_diff(array_keys($input), ['body', 'parent_id', 'depth']);
        $body = tasko_validate_comment_body($input['body'] ?? null);
        $fields = [];
        if ($unknown !== []) $fields['comment'] = 'Pošli iba povolené polia komentára.';
        if ($body === null) $fields['body'] = 'Komentár musí mať 1 až 1 000 znakov.';

        $parentId = null;
        $depth = 0;
        if (array_key_exists('parent_id', $input) && $input['parent_id'] !== null) {
            if (!tasko_validate_id($input['parent_id'])) {
                $fields['parent_id'] = 'Vyber platný rodičovský komentár.';
            } else {
                $parentId = (int) $input['parent_id'];
                $parent = $pdo->prepare(
                    'WITH RECURSIVE comment_tree AS (
                        SELECT id, task_id, parent_id, 0 AS depth FROM comments
                        WHERE id = :parent_id AND task_id = :task_id
                        UNION ALL
                        SELECT parent.id, parent.task_id, parent.parent_id, tree.depth + 1
                        FROM comments parent
                        INNER JOIN comment_tree tree ON tree.parent_id = parent.id AND tree.task_id = parent.task_id
                     )
                     SELECT MAX(depth) FROM comment_tree'
                );
                $parent->execute(['parent_id' => $parentId, 'task_id' => $taskId]);
                $parentDepth = $parent->fetchColumn();
                if ($parentDepth === false || $parentDepth === null) {
                    $fields['parent_id'] = 'Rodičovský komentár nepatrí k tejto úlohe.';
                } else {
                    $depth = (int) $parentDepth + 1;
                }
            }
        }
        if ($fields !== []) tasko_validation_error($fields);
        if ($depth > 4) {
            throw new TaskoHttpException(422, 'comment_too_deep', 'Odpoveď prekračuje maximálnu hĺbku komentárov.');
        }

        $insert = $pdo->prepare(
            'INSERT INTO comments (task_id, parent_id, author_id, body)
             VALUES (:task_id, :parent_id, :author_id, :body)'
        );
        $pdo->beginTransaction();
        $insert->execute([
            'task_id' => $taskId,
            'parent_id' => $parentId,
            'author_id' => $userId,
            'body' => $body,
        ]);
        $newId = (int) $pdo->lastInsertId();
        tasko_record_audit_event($pdo, (int) $task['project_id'], 'comment', $newId, $userId, 'comment_created', ['snapshot' => ['task_id' => $taskId, 'parent_id' => $parentId, 'body' => $body]]);
        $pdo->commit();
        $created = $pdo->prepare(
            'SELECT id, task_id, parent_id, author_id, body, created_at, :depth AS depth,
                    (SELECT name FROM users WHERE id = :author_id) AS author_name
             FROM comments WHERE id = :id'
        );
        $created->execute(['depth' => $depth, 'author_id' => $userId, 'id' => $newId]);
        $row = $created->fetch();
        if (!is_array($row)) throw new RuntimeException('Vložený komentár sa nepodarilo načítať.');
        $commentRights = $pdo->prepare(
            'SELECT p.user_id AS owner_id, pm.can_edit_own_comments, pm.can_delete_own_comments,
                    ts.can_edit_own_comments AS share_edit_own, ts.can_delete_own_comments AS share_delete_own
             FROM tasks t INNER JOIN projects p ON p.id = t.project_id
             LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :user_id
             LEFT JOIN task_shares ts ON ts.task_id = t.id AND ts.user_id = :share_user_id
             WHERE t.id = :task_id'
        );
        $commentRights->execute(['user_id' => $userId, 'share_user_id' => $userId, 'task_id' => $taskId]);
        $rights = $commentRights->fetch() ?: [];
        $owner = (int) ($rights['owner_id'] ?? 0) === $userId;
        tasko_json_response(201, tasko_comment_data($row, $userId, $owner || (bool) ($rights['can_edit_own_comments'] ?? false) || (bool) ($rights['share_edit_own'] ?? false), $owner || (bool) ($rights['can_delete_own_comments'] ?? false) || (bool) ($rights['share_delete_own'] ?? false)));
    }

    if (preg_match('#^/api/comments/([^/]+)$#D', $route, $commentRoute) === 1 && in_array($method, ['PATCH', 'DELETE'], true)) {
        $user = tasko_authenticated_user();
        tasko_require_comment_access((string) $user['plan']);
        tasko_require_same_origin();
        if (!tasko_validate_id($commentRoute[1])) {
            throw new TaskoHttpException(404, 'not_found', 'Komentár sa nenašiel.');
        }
        $pdo = tasko_db();
        $comment = $pdo->prepare('SELECT c.author_id, c.task_id, c.parent_id, c.body, t.project_id FROM comments c INNER JOIN tasks t ON t.id = c.task_id WHERE c.id = :id');
        $comment->execute(['id' => (int) $commentRoute[1]]);
        $row = $comment->fetch();
        if (!is_array($row)) throw new TaskoHttpException(404, 'not_found', 'Komentár sa nenašiel.');
        tasko_require_task_right($pdo, (int) $row['task_id'], (int) $user['id'], ($method === 'PATCH' ? 'edit_' : 'delete_') . ((int) $row['author_id'] === (int) $user['id'] ? 'own' : 'other') . '_comments');
        if ($method === 'PATCH') {
            $input = tasko_read_json_body();
            if (array_diff(array_keys($input), ['body']) !== []) tasko_validation_error(['comment' => 'Pošli iba text komentára.']);
            $body = tasko_validate_comment_body($input['body'] ?? null);
            if ($body === null) tasko_validation_error(['body' => 'Komentár musí mať 1 až 1 000 znakov.']);
            $pdo->beginTransaction();
            $pdo->prepare('UPDATE comments SET body = :body WHERE id = :id')->execute(['body' => $body, 'id' => (int) $commentRoute[1]]);
            if ((string) $row['body'] !== $body) tasko_record_audit_event($pdo, (int) $row['project_id'], 'comment', (int) $commentRoute[1], (int) $user['id'], 'comment_updated', ['changes' => ['body' => ['old' => (string) $row['body'], 'new' => $body]]]);
            $pdo->commit();
            tasko_json_response(200, ['id' => (int) $commentRoute[1], 'body' => $body]);
        }
        $pdo->beginTransaction();
        $tree = $pdo->prepare(
            'WITH RECURSIVE comment_tree AS (
                SELECT id, parent_id, body FROM comments WHERE id = :comment_id
                UNION ALL
                SELECT child.id, child.parent_id, child.body FROM comments child
                INNER JOIN comment_tree parent ON child.parent_id = parent.id
             ) SELECT id, parent_id, body FROM comment_tree'
        );
        $tree->execute(['comment_id' => (int) $commentRoute[1]]);
        foreach ($tree->fetchAll() as $deletedComment) tasko_record_audit_event($pdo, (int) $row['project_id'], 'comment', (int) $deletedComment['id'], (int) $user['id'], 'comment_deleted', ['snapshot' => ['task_id' => (int) $row['task_id'], 'parent_id' => $deletedComment['parent_id'] === null ? null : (int) $deletedComment['parent_id'], 'body' => (string) $deletedComment['body']]]);
        $pdo->prepare('DELETE FROM comments WHERE id = :id')->execute(['id' => (int) $commentRoute[1]]);
        $pdo->commit();
        tasko_json_response(204);
    }

    if (preg_match('#^/api/tasks/([^/]+)/(complete|uncomplete)$#D', $route, $taskActionRoute) === 1 && $method === 'POST') {
        $user = tasko_authenticated_user();
        tasko_require_same_origin();
        if (!tasko_validate_id($taskActionRoute[1])) {
            throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
        }
        $taskId = (int) $taskActionRoute[1];
        $pdo = tasko_db();
        $task = tasko_task_find($pdo, (int) $user['id'], $taskId);
        tasko_require_task_right($pdo, $taskId, (int) $user['id'], 'complete');
        $update = $taskActionRoute[2] === 'complete'
            ? $pdo->prepare('UPDATE tasks SET is_done = 1, completed_at = COALESCE(completed_at, UTC_TIMESTAMP()) WHERE id = :task_id')
            : $pdo->prepare('UPDATE tasks SET is_done = 0, completed_at = NULL WHERE id = :task_id');
        $pdo->beginTransaction();
        $update->execute(['task_id' => $taskId]);
        $completed = $taskActionRoute[2] === 'complete';
        if ((bool) $task['is_done'] !== $completed) {
            tasko_record_audit_event($pdo, (int) $task['project_id'], 'task', $taskId, (int) $user['id'], $completed ? 'task_completed' : 'task_reopened', ['changes' => ['is_done' => ['old' => (bool) $task['is_done'], 'new' => $completed]]]);
        }
        $pdo->commit();
        tasko_json_response(200, tasko_task_find($pdo, (int) $user['id'], $taskId));
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
            tasko_require_task_right($pdo, $taskId, (int) $user['id'], 'delete');
            $pdo->beginTransaction();
            $pdo->prepare('SELECT id FROM tasks WHERE id = :task_id FOR UPDATE')->execute(['task_id' => $taskId]);
            $taskComments = $pdo->prepare('SELECT id, parent_id, body FROM comments WHERE task_id = :task_id');
            $taskComments->execute(['task_id' => $taskId]);
            foreach ($taskComments->fetchAll() as $commentSnapshot) tasko_record_audit_event($pdo, (int) $current['project_id'], 'comment', (int) $commentSnapshot['id'], (int) $user['id'], 'comment_deleted', ['snapshot' => ['task_id' => $taskId, 'parent_id' => $commentSnapshot['parent_id'] === null ? null : (int) $commentSnapshot['parent_id'], 'body' => $commentSnapshot['body'], 'reason' => 'task_deleted']]);
            tasko_record_audit_event($pdo, (int) $current['project_id'], 'task', $taskId, (int) $user['id'], 'task_deleted', ['snapshot' => ['title' => $current['title'], 'description' => $current['description'], 'priority' => $current['priority'], 'due_date' => $current['due_date'], 'is_done' => $current['is_done']]]);
            $pdo->prepare('DELETE FROM tasks WHERE id = :task_id')->execute(['task_id' => $taskId]);
            $pdo->commit();
            tasko_json_response(204);
        }

        tasko_require_task_right($pdo, $taskId, (int) $user['id'], 'edit');

        $input = tasko_read_json_body();
        // Povolené názvy polí tvoria aj zoznam SQL identifikátorov; hodnoty ostávajú parametrizované.
        $allowedFields = ['title', 'description', 'project_id', 'priority', 'due_date', 'assignee_id', 'reviewer_id'];
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
                try {
                    if ((int) $values['project_id'] !== (int) $current['project_id']) {
                        tasko_require_project_permission($pdo, (int) $values['project_id'], (int) $user['id'], 'can_add_tasks');
                    }
                    $values['project_id'] = (int) $values['project_id'];
                } catch (TaskoHttpException) {
                    $fields['project_id'] = 'Vybraný projekt neexistuje alebo k nemu nemáš oprávnenie.';
                }
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
        foreach (['assignee_id', 'reviewer_id'] as $field) {
            if (!array_key_exists($field, $input)) continue;
            $candidate = $input[$field];
            if ($candidate !== null && !tasko_validate_id($candidate)) { $fields[$field] = 'Vyber používateľa s prístupom k úlohe.'; continue; }
            if ($candidate !== null) {
                $assignmentProjectId = (int) ($values['project_id'] ?? $current['project_id']);
                $eligible = $pdo->prepare('SELECT 1 FROM projects p WHERE p.id = :owner_project AND p.user_id = :owner_user UNION SELECT 1 FROM project_members pm WHERE pm.project_id = :member_project AND pm.user_id = :member_user AND pm.can_view_tasks = 1 UNION SELECT 1 FROM task_shares ts WHERE ts.task_id = :task_id AND ts.user_id = :share_user AND ts.can_view = 1');
                $eligible->execute(['owner_project' => $assignmentProjectId, 'owner_user' => (int) $candidate, 'member_project' => $assignmentProjectId, 'member_user' => (int) $candidate, 'task_id' => $taskId, 'share_user' => (int) $candidate]);
                if (!$eligible->fetchColumn()) $fields[$field] = 'Používateľ nemá prístup k tejto úlohe.';
                else $values[$field] = (int) $candidate;
            } else $values[$field] = null;
        }
        if ($fields !== []) tasko_validation_error($fields);

        $assignments = [];
        foreach (array_keys($values) as $field) $assignments[] = "t.`$field` = :$field";
        $values['task_id'] = $taskId;
        $pdo->beginTransaction();
        $update = $pdo->prepare(
            'UPDATE tasks t INNER JOIN projects p ON p.id = t.project_id SET ' . implode(', ', $assignments) .
            ' WHERE t.id = :task_id'
        );
        $update->execute($values);
        $changes = [];
        foreach ($values as $field => $value) {
            if ($field === 'task_id') continue;
            $old = $current[$field] ?? null;
            if ((string) ($old ?? '') !== (string) ($value ?? '')) $changes[$field] = ['old' => $old, 'new' => $value];
        }
        if ($changes !== []) tasko_record_audit_event($pdo, (int) ($values['project_id'] ?? $current['project_id']), 'task', $taskId, (int) $user['id'], 'task_updated', ['changes' => $changes]);
        $pdo->commit();
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
