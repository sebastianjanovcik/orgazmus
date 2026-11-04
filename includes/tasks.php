<?php
declare(strict_types=1);

/**
 * Vytvorí verejný tvar úlohy bez interných polí projektu a normalizuje typy,
 * ktoré PDO vracia z MySQL ako reťazce.
 */
function tasko_task_data(array $task): array
{
    $completedAt = $task['completed_at'] === null
        ? null
        : (new DateTimeImmutable((string) $task['completed_at'], new DateTimeZone('UTC')))
            ->format('Y-m-d\TH:i:s\Z');

    return [
        'id' => (int) $task['id'],
        'project_id' => (int) $task['project_id'],
        'created_by' => (int) $task['created_by'],
        'title' => (string) $task['title'],
        'description' => $task['description'] === null ? null : (string) $task['description'],
        'priority' => (int) $task['priority'],
        'due_date' => (string) $task['due_date'],
        'is_done' => (bool) $task['is_done'],
        'completed_at' => $completedAt,
        'can_edit' => (bool) $task['can_edit'],
        'can_delete' => (bool) $task['can_delete'],
        'can_complete' => (bool) $task['can_complete'],
        'can_view_comments' => (bool) $task['can_view_comments'],
        'can_add_comments' => (bool) $task['can_add_comments'],
    ];
}

/**
 * Načíta filtre len v tvare definovanom kontraktom; hodnoty sa nikdy nevkladajú
 * priamo do SQL, takže chybný alebo upravený query string nemôže rozšíriť výber.
 */
function tasko_task_filters(array $query): array
{
    $filters = [];
    $unknown = array_diff(array_keys($query), ['project_id', 'date', 'from', 'to', 'done']);
    if ($unknown !== []) {
        throw new TaskoHttpException(400, 'bad_request', 'Požiadavka obsahuje neznámy filter úloh.');
    }
    foreach (['project_id', 'date', 'from', 'to', 'done'] as $key) {
        if (!array_key_exists($key, $query)) {
            continue;
        }
        if (!is_string($query[$key])) {
            throw new TaskoHttpException(400, 'bad_request', 'Filter úloh nemá platný formát.');
        }
        $filters[$key] = $query[$key];
    }

    if (isset($filters['project_id']) && !tasko_validate_id($filters['project_id'])) {
        throw new TaskoHttpException(400, 'bad_request', 'Filter project_id musí byť kladné celé číslo.');
    }
    foreach (['date', 'from', 'to'] as $key) {
        if (isset($filters[$key]) && !tasko_validate_date($filters[$key])) {
            throw new TaskoHttpException(400, 'bad_request', "Filter $key musí byť platný dátum YYYY-MM-DD.");
        }
    }
    if (isset($filters['done']) && !in_array($filters['done'], ['0', '1'], true)) {
        throw new TaskoHttpException(400, 'bad_request', 'Filter done prijíma iba 0 alebo 1.');
    }
    if (isset($filters['from'], $filters['to']) && $filters['from'] > $filters['to']) {
        throw new TaskoHttpException(400, 'bad_request', 'Filter from nemôže byť neskôr ako to.');
    }

    return $filters;
}

/** Vráti úlohy iba z projektov, v ktorých má používateľ právo čítať úlohy. */
function tasko_tasks_find(PDO $pdo, int $userId, array $filters): array
{
    $conditions = ['(p.user_id = :owner_id OR (pm.user_id IS NOT NULL AND pm.can_view_tasks = 1))'];
    $parameters = ['owner_id' => $userId, 'member_id' => $userId, 'edit_owner' => $userId,
        'edit_creator_own' => $userId, 'edit_creator_other' => $userId, 'delete_owner' => $userId,
        'delete_creator_own' => $userId, 'delete_creator_other' => $userId,
        'complete_owner' => $userId, 'complete_creator' => $userId,
        'comments_view_owner' => $userId, 'comments_add_owner' => $userId];
    if (isset($filters['project_id'])) {
        $conditions[] = 't.project_id = :project_id';
        $parameters['project_id'] = (int) $filters['project_id'];
    }
    if (isset($filters['date'])) {
        // Presný deň má prednosť pred rozsahom, no obe hranice už boli validované.
        $conditions[] = 't.due_date = :date';
        $parameters['date'] = $filters['date'];
    } else {
        if (isset($filters['from'])) {
            $conditions[] = 't.due_date >= :date_from';
            $parameters['date_from'] = $filters['from'];
        }
        if (isset($filters['to'])) {
            $conditions[] = 't.due_date <= :date_to';
            $parameters['date_to'] = $filters['to'];
        }
    }
    if (isset($filters['done'])) {
        $conditions[] = 't.is_done = :is_done';
        $parameters['is_done'] = (int) $filters['done'];
    }

    $statement = $pdo->prepare(
        'SELECT t.id, t.project_id, t.created_by, t.title, t.description, t.priority,
                t.due_date, t.is_done, t.completed_at,
                (p.user_id = :edit_owner OR (t.created_by = :edit_creator_own AND pm.can_edit_own_tasks = 1) OR (t.created_by <> :edit_creator_other AND pm.can_edit_other_tasks = 1)) AS can_edit,
                (p.user_id = :delete_owner OR (t.created_by = :delete_creator_own AND pm.can_delete_own_tasks = 1) OR (t.created_by <> :delete_creator_other AND pm.can_delete_other_tasks = 1)) AS can_delete,
                (p.user_id = :complete_owner OR t.created_by = :complete_creator OR pm.can_complete_tasks = 1) AS can_complete,
                (p.user_id = :comments_view_owner OR pm.can_view_comments = 1) AS can_view_comments,
                (p.user_id = :comments_add_owner OR pm.can_add_comments = 1) AS can_add_comments
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
         WHERE ' . implode(' AND ', $conditions) . '
         ORDER BY t.is_done ASC, t.due_date ASC, t.priority DESC, t.id ASC'
    );
    $statement->execute($parameters);

    return array_map('tasko_task_data', $statement->fetchAll());
}

/** Detail sa vyhľadá cez členstvo a právo čítať úlohy; cudzie ID zostáva skryté. */
function tasko_task_find(PDO $pdo, int $userId, int $taskId): array
{
    $statement = $pdo->prepare(
        'SELECT t.id, t.project_id, t.created_by, t.title, t.description, t.priority,
                t.due_date, t.is_done, t.completed_at,
                (p.user_id = :edit_owner OR (t.created_by = :edit_creator_own AND pm.can_edit_own_tasks = 1) OR (t.created_by <> :edit_creator_other AND pm.can_edit_other_tasks = 1)) AS can_edit,
                (p.user_id = :delete_owner OR (t.created_by = :delete_creator_own AND pm.can_delete_own_tasks = 1) OR (t.created_by <> :delete_creator_other AND pm.can_delete_other_tasks = 1)) AS can_delete,
                (p.user_id = :complete_owner OR t.created_by = :complete_creator OR pm.can_complete_tasks = 1) AS can_complete,
                (p.user_id = :comments_view_owner OR pm.can_view_comments = 1) AS can_view_comments,
                (p.user_id = :comments_add_owner OR pm.can_add_comments = 1) AS can_add_comments
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
         WHERE (p.user_id = :owner_id OR (pm.user_id IS NOT NULL AND pm.can_view_tasks = 1)) AND t.id = :task_id'
    );
    $statement->execute(['member_id' => $userId, 'owner_id' => $userId, 'task_id' => $taskId,
        'edit_owner' => $userId, 'edit_creator_own' => $userId, 'edit_creator_other' => $userId,
        'delete_owner' => $userId, 'delete_creator_own' => $userId, 'delete_creator_other' => $userId,
        'complete_owner' => $userId, 'complete_creator' => $userId,
        'comments_view_owner' => $userId, 'comments_add_owner' => $userId]);
    $task = $statement->fetch();
    if (!is_array($task)) {
        throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
    }

    return tasko_task_data($task);
}
