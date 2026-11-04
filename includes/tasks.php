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

/** Vráti zoradené úlohy iba z projektov vlastníka; SQL podmienky sú pevne určené. */
function tasko_tasks_find(PDO $pdo, int $userId, array $filters): array
{
    $conditions = ['p.user_id = :user_id'];
    $parameters = ['user_id' => $userId];
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
                t.due_date, t.is_done, t.completed_at
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         WHERE ' . implode(' AND ', $conditions) . '
         ORDER BY t.is_done ASC, t.due_date ASC, t.priority DESC, t.id ASC'
    );
    $statement->execute($parameters);

    return array_map('tasko_task_data', $statement->fetchAll());
}

/** Detail sa vyhľadá cez vlastníctvo projektu, aby cudzie ID vyzeralo ako chýbajúce. */
function tasko_task_find(PDO $pdo, int $userId, int $taskId): array
{
    $statement = $pdo->prepare(
        'SELECT t.id, t.project_id, t.created_by, t.title, t.description, t.priority,
                t.due_date, t.is_done, t.completed_at
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         WHERE p.user_id = :user_id AND t.id = :task_id'
    );
    $statement->execute(['user_id' => $userId, 'task_id' => $taskId]);
    $task = $statement->fetch();
    if (!is_array($task)) {
        throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
    }

    return tasko_task_data($task);
}
