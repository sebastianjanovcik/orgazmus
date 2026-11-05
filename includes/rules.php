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

/** Kontroluje konkrétne právo k úlohe; pri priamom zdieľaní sa nikdy neudeľujú práva k projektu. */
function tasko_require_task_right(PDO $pdo, int $taskId, int $userId, string $right, ?int $authorId = null): array
{
    $rights = ['view', 'edit', 'delete', 'complete', 'view_comments', 'add_comments', 'edit_own_comments', 'edit_other_comments', 'delete_own_comments', 'delete_other_comments'];
    if (!in_array($right, $rights, true)) throw new LogicException('Neznáme oprávnenie úlohy.');
    $query = $pdo->prepare(
        'SELECT t.id, t.project_id, t.created_by, t.assignee_id, p.user_id AS owner_id,
                pm.user_id AS member_id, pm.can_view_tasks, pm.can_complete_tasks,
                pm.can_edit_own_tasks, pm.can_edit_other_tasks, pm.can_delete_own_tasks, pm.can_delete_other_tasks,
                pm.can_view_comments, pm.can_add_comments, pm.can_edit_own_comments, pm.can_edit_other_comments,
                pm.can_delete_own_comments, pm.can_delete_other_comments, ts.can_view AS share_view,
                ts.can_edit AS share_edit, ts.can_delete AS share_delete, ts.can_complete AS share_complete,
                ts.can_view_comments AS share_view_comments, ts.can_add_comments AS share_add_comments,
                ts.can_edit_own_comments AS share_edit_own_comments, ts.can_edit_other_comments AS share_edit_other_comments,
                ts.can_delete_own_comments AS share_delete_own_comments, ts.can_delete_other_comments AS share_delete_other_comments
         FROM tasks t INNER JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
         LEFT JOIN task_shares ts ON ts.task_id = t.id AND ts.user_id = :share_user_id
         WHERE t.id = :task_id'
    );
    $query->execute(['member_id' => $userId, 'share_user_id' => $userId, 'task_id' => $taskId]);
    $row = $query->fetch();
    if (!is_array($row)) throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
    $isOwner = (int) $row['owner_id'] === $userId;
    $isMember = $row['member_id'] !== null;
    $isShared = (bool) $row['share_view'];
    if (!$isOwner && !$isShared && (!$isMember || !(bool) $row['can_view_tasks'])) {
        throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
    }
    $allowed = $isOwner;
    if (!$allowed && $isMember) {
        $column = match ($right) {
            'view' => 'can_view_tasks', 'complete' => 'can_complete_tasks',
            'edit' => ((int) $row['created_by'] === $userId ? 'can_edit_own_tasks' : 'can_edit_other_tasks'),
            'delete' => ((int) $row['created_by'] === $userId ? 'can_delete_own_tasks' : 'can_delete_other_tasks'),
            default => 'can_' . $right,
        };
        $allowed = (bool) $row[$column];
        if ($right === 'complete' && ((int) $row['created_by'] === $userId || (int) ($row['assignee_id'] ?? 0) === $userId)) $allowed = true;
    }
    if (!$allowed && $isShared) {
        $shareColumn = match ($right) {
            'view' => 'share_view', 'edit' => 'share_edit', 'delete' => 'share_delete', 'complete' => 'share_complete',
            'view_comments' => 'share_view_comments', 'add_comments' => 'share_add_comments',
            'edit_own_comments' => 'share_edit_own_comments', 'edit_other_comments' => 'share_edit_other_comments',
            'delete_own_comments' => 'share_delete_own_comments', 'delete_other_comments' => 'share_delete_other_comments',
        };
        $allowed = (bool) $row[$shareColumn];
    }
    if (!$allowed) throw new TaskoHttpException(403, 'forbidden', 'Na túto akciu nemáš oprávnenie.');
    return $row;
}
