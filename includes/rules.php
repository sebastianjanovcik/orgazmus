<?php
declare(strict_types=1);

/** Vráti projektový limit Standard alebo null pre neobmedzený Premium. */
function tasko_project_limit(string $plan): ?int
{
    return match ($plan) {
        'standard' => 3,
        'premium' => null,
        default => throw new InvalidArgumentException('Neznámy plán používateľa.'),
    };
}

/** Overí, či plán povoľuje Premium komentáre. */
function tasko_plan_allows_comments(string $plan): bool
{
    return $plan === 'premium';
}

/** Použije pripravený dotaz na kontrolu limitu pred vložením ďalšieho projektu. */
function tasko_require_project_capacity(PDO $pdo, int $userId, string $plan): void
{
    $limit = tasko_project_limit($plan);
    if ($limit === null) {
        return;
    }

    $statement = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = :user_id');
    $statement->execute(['user_id' => $userId]);
    if ((int) $statement->fetchColumn() >= $limit) {
        throw new TaskoHttpException(403, 'plan_limit', 'Tvoj plán už dosiahol limit projektov.');
    }
}

/** Vyžaduje Premium a vráti jednotnú chybu API pri pokuse o použitie komentárov. */
function tasko_require_comment_access(string $plan): void
{
    if (!tasko_plan_allows_comments($plan)) {
        throw new TaskoHttpException(403, 'premium_required', 'Komentáre sú dostupné v pláne Premium.');
    }
}

/** Načíta členstvo a vráti jednotnú 404/403 odpoveď pre projektové operácie. */
function tasko_require_project_permission(PDO $pdo, int $projectId, int $userId, string $permission): array
{
    $allowed = [
        'can_view_project', 'can_manage_project', 'can_view_tasks', 'can_add_tasks',
        'can_complete_tasks', 'can_edit_own_tasks', 'can_edit_other_tasks',
        'can_delete_own_tasks', 'can_delete_other_tasks', 'can_view_comments',
        'can_add_comments', 'can_edit_own_comments', 'can_edit_other_comments',
        'can_delete_own_comments', 'can_delete_other_comments',
    ];
    if (!in_array($permission, $allowed, true)) {
        throw new LogicException('Neznáme projektové oprávnenie.');
    }

    $query = $pdo->prepare(
        'SELECT p.user_id AS owner_id, pm.user_id, pm.' . $permission . ' AS allowed
         FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :user_id
         WHERE p.id = :project_id'
    );
    $query->execute(['user_id' => $userId, 'project_id' => $projectId]);
    $row = $query->fetch();
    if (!is_array($row) || ((int) $row['owner_id'] !== $userId && $row['user_id'] === null)) {
        throw new TaskoHttpException(404, 'not_found', 'Projekt sa nenašiel.');
    }
    $isOwner = (int) $row['owner_id'] === $userId;
    if (!$isOwner && !(bool) $row['allowed']) {
        throw new TaskoHttpException(403, 'forbidden', 'Na túto akciu nemáš oprávnenie.');
    }
    return ['owner_id' => (int) $row['owner_id'], 'is_owner' => $isOwner];
}

/** Pri úprave alebo mazaní zvolí právo podľa autora záznamu načítaného zo servera. */
function tasko_require_record_permission(PDO $pdo, int $projectId, int $userId, int $authorId, string $kind, string $action): void
{
    $scope = $authorId === $userId ? 'own' : 'other';
    tasko_require_project_permission($pdo, $projectId, $userId, 'can_' . $action . '_' . $scope . '_' . $kind);
}
