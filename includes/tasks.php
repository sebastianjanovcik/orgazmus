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
        'creator_name' => (string) $task['creator_name'],
        'assignee_id' => $task['assignee_id'] === null ? null : (int) $task['assignee_id'],
        'assignee_name' => $task['assignee_name'] === null ? null : (string) $task['assignee_name'],
        'reviewer_id' => $task['reviewer_id'] === null ? null : (int) $task['reviewer_id'],
        'reviewer_name' => $task['reviewer_name'] === null ? null : (string) $task['reviewer_name'],
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
    $unknown = array_diff(array_keys($query), ['project_id', 'date', 'from', 'to', 'done', 'visibility', 'before_id', 'after_due_date', 'after_priority', 'after_id', 'limit']);
    if ($unknown !== []) {
        throw new TaskoHttpException(400, 'bad_request', 'Požiadavka obsahuje neznámy filter úloh.');
    }
    foreach (['project_id', 'date', 'from', 'to', 'done', 'visibility', 'before_id', 'after_due_date', 'after_priority', 'after_id', 'limit'] as $key) {
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
    if (isset($filters['before_id']) && !tasko_validate_id($filters['before_id'])) {
        throw new TaskoHttpException(400, 'bad_request', 'Pointer úloh musí byť kladné celé číslo.');
    }
    $cursorFields = ['after_due_date', 'after_priority', 'after_id'];
    $cursorCount = count(array_intersect($cursorFields, array_keys($filters)));
    if ($cursorCount !== 0 && $cursorCount !== count($cursorFields)) {
        throw new TaskoHttpException(400, 'bad_request', 'Pokračovací kurzor úloh nie je úplný.');
    }
    if (isset($filters['after_due_date']) && !tasko_validate_date($filters['after_due_date'])) {
        throw new TaskoHttpException(400, 'bad_request', 'Dátum pokračovacieho kurzora nie je platný.');
    }
    if (isset($filters['after_priority']) && (!ctype_digit($filters['after_priority']) || (int) $filters['after_priority'] < 1 || (int) $filters['after_priority'] > 4)) {
        throw new TaskoHttpException(400, 'bad_request', 'Priorita pokračovacieho kurzora nie je platná.');
    }
    if (isset($filters['after_id']) && !tasko_validate_id($filters['after_id'])) {
        throw new TaskoHttpException(400, 'bad_request', 'ID pokračovacieho kurzora nie je platné.');
    }
    if (isset($filters['limit']) && (!ctype_digit($filters['limit']) || (int) $filters['limit'] < 1 || (int) $filters['limit'] > 100)) {
        throw new TaskoHttpException(400, 'bad_request', 'Veľkosť dávky úloh musí byť od 1 do 100.');
    }
    foreach (['date', 'from', 'to'] as $key) {
        if (isset($filters[$key]) && !tasko_validate_date($filters[$key])) {
            throw new TaskoHttpException(400, 'bad_request', "Filter $key musí byť platný dátum YYYY-MM-DD.");
        }
    }
    if (isset($filters['done']) && !in_array($filters['done'], ['0', '1'], true)) {
        throw new TaskoHttpException(400, 'bad_request', 'Filter done prijíma iba 0 alebo 1.');
    }
    if (isset($filters['visibility']) && !in_array($filters['visibility'], ['all', 'mine', 'shared'], true)) {
        throw new TaskoHttpException(400, 'bad_request', 'Filter visibility musí byť all, mine alebo shared.');
    }
    if (isset($filters['from'], $filters['to']) && $filters['from'] > $filters['to']) {
        throw new TaskoHttpException(400, 'bad_request', 'Filter from nemôže byť neskôr ako to.');
    }

    return $filters;
}

/** Vráti úlohy iba z projektov, v ktorých má používateľ právo čítať úlohy. */
function tasko_tasks_find(PDO $pdo, int $userId, array $filters): array
{
    $conditions = ['(p.user_id = :owner_id OR (pm.user_id IS NOT NULL AND pm.can_view_tasks = 1) OR ts.can_view = 1)'];
    $parameters = ['owner_id' => $userId, 'member_id' => $userId, 'edit_owner' => $userId,
        'edit_creator_own' => $userId, 'edit_creator_other' => $userId, 'delete_owner' => $userId,
        'delete_creator_own' => $userId, 'delete_creator_other' => $userId,
        'complete_owner' => $userId, 'complete_creator' => $userId, 'complete_assignee' => $userId,
        'comments_view_owner' => $userId, 'comments_add_owner' => $userId];
    if (isset($filters['project_id'])) {
        $conditions[] = 't.project_id = :project_id';
        $parameters['project_id'] = (int) $filters['project_id'];
    }
    if (isset($filters['before_id'])) {
        $conditions[] = 't.id < :before_id';
        $parameters['before_id'] = (int) $filters['before_id'];
    }
    if (isset($filters['after_due_date'], $filters['after_priority'], $filters['after_id'])) {
        // Zložený kurzor zachová chronologické poradie aj pri rovnakých termínoch a prioritách.
        $conditions[] = '(t.due_date > :after_due_date OR (t.due_date = :after_due_date_equal AND (t.priority < :after_priority OR (t.priority = :after_priority_equal AND t.id > :after_id))))';
        $parameters['after_due_date'] = $filters['after_due_date'];
        $parameters['after_due_date_equal'] = $filters['after_due_date'];
        $parameters['after_priority'] = (int) $filters['after_priority'];
        $parameters['after_priority_equal'] = (int) $filters['after_priority'];
        $parameters['after_id'] = (int) $filters['after_id'];
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
    if (($filters['visibility'] ?? 'all') === 'mine') {
        $conditions[] = 't.created_by = :visibility_mine';
        $parameters['visibility_mine'] = $userId;
    } elseif (($filters['visibility'] ?? 'all') === 'shared') {
        $conditions[] = '(t.created_by <> :visibility_owner OR ts.can_view = 1)';
        $parameters['visibility_owner'] = $userId;
    }

    $statement = $pdo->prepare(
        'SELECT t.id, t.project_id, t.created_by, creator.name AS creator_name,
                t.assignee_id, assignee.name AS assignee_name, t.reviewer_id, reviewer.name AS reviewer_name, t.title, t.description, t.priority,
                t.due_date, t.is_done, t.completed_at,
                (p.user_id = :edit_owner OR (t.created_by = :edit_creator_own AND pm.can_edit_own_tasks = 1) OR (t.created_by <> :edit_creator_other AND pm.can_edit_other_tasks = 1) OR ts.can_edit = 1) AS can_edit,
                (p.user_id = :delete_owner OR (t.created_by = :delete_creator_own AND pm.can_delete_own_tasks = 1) OR (t.created_by <> :delete_creator_other AND pm.can_delete_other_tasks = 1) OR ts.can_delete = 1) AS can_delete,
                (p.user_id = :complete_owner OR t.created_by = :complete_creator OR t.assignee_id = :complete_assignee OR pm.can_complete_tasks = 1 OR ts.can_complete = 1) AS can_complete,
                (p.user_id = :comments_view_owner OR pm.can_view_comments = 1 OR ts.can_view_comments = 1) AS can_view_comments,
                (p.user_id = :comments_add_owner OR pm.can_add_comments = 1 OR ts.can_add_comments = 1) AS can_add_comments
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         INNER JOIN users creator ON creator.id = t.created_by
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
         LEFT JOIN task_shares ts ON ts.task_id = t.id AND ts.user_id = :share_user_id
         LEFT JOIN users assignee ON assignee.id = t.assignee_id
         LEFT JOIN users reviewer ON reviewer.id = t.reviewer_id
         WHERE ' . implode(' AND ', $conditions) . '
         ORDER BY ' . (isset($filters['limit'])
             ? (($filters['done'] ?? null) === '0' ? 't.due_date ASC, t.priority DESC, t.id ASC' : 't.id DESC') . ' LIMIT ' . ((int) $filters['limit'] + 1)
             : 't.is_done ASC, t.due_date ASC, t.priority DESC, t.id ASC')
    );
    $parameters['share_user_id'] = $userId;
    // ID zostáva stabilným kurzorom aj keď sa úloha dokončí alebo zmení termín; limit je pred vložením do SQL ohraničený validáciou.
    $statement->execute($parameters);

    return array_map('tasko_task_data', $statement->fetchAll());
}

/** Počíta súhrn všetkých dostupných úloh, nie iba kariet načítanej stránky. */
function tasko_tasks_summary(PDO $pdo, int $userId, array $filters): array
{
    $conditions = ['(p.user_id = :summary_owner OR (pm.user_id IS NOT NULL AND pm.can_view_tasks = 1) OR ts.can_view = 1)'];
    $parameters = ['summary_owner' => $userId, 'summary_member' => $userId, 'summary_share_user' => $userId];
    if (isset($filters['project_id'])) {
        $conditions[] = 't.project_id = :summary_project';
        $parameters['summary_project'] = (int) $filters['project_id'];
    }
    if (isset($filters['date'])) {
        $conditions[] = 't.due_date = :summary_date';
        $parameters['summary_date'] = $filters['date'];
    } else {
        if (isset($filters['from'])) {
            $conditions[] = 't.due_date >= :summary_from';
            $parameters['summary_from'] = $filters['from'];
        }
        if (isset($filters['to'])) {
            $conditions[] = 't.due_date <= :summary_to';
            $parameters['summary_to'] = $filters['to'];
        }
    }
    if (($filters['visibility'] ?? 'all') === 'mine') {
        $conditions[] = 't.created_by = :summary_mine';
        $parameters['summary_mine'] = $userId;
    } elseif (($filters['visibility'] ?? 'all') === 'shared') {
        $conditions[] = '(t.created_by <> :summary_not_mine OR ts.can_view = 1)';
        $parameters['summary_not_mine'] = $userId;
    }

    $statement = $pdo->prepare(
        'SELECT COUNT(DISTINCT t.id) AS total_count,
                COUNT(DISTINCT CASE WHEN t.is_done = 0 THEN t.id END) AS open_count,
                COUNT(DISTINCT CASE WHEN t.is_done = 1 THEN t.id END) AS done_count,
                COUNT(DISTINCT CASE WHEN t.is_done = 0 AND t.due_date < UTC_DATE() THEN t.id END) AS overdue_count
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :summary_member
         LEFT JOIN task_shares ts ON ts.task_id = t.id AND ts.user_id = :summary_share_user
         WHERE ' . implode(' AND ', $conditions)
    );
    $statement->execute($parameters);
    $summary = $statement->fetch();

    return [
        'total' => (int) $summary['total_count'],
        'open' => (int) $summary['open_count'],
        'done' => (int) $summary['done_count'],
        'overdue' => (int) $summary['overdue_count'],
    ];
}

/** Detail sa vyhľadá cez členstvo a právo čítať úlohy; cudzie ID zostáva skryté. */
function tasko_task_find(PDO $pdo, int $userId, int $taskId): array
{
    $statement = $pdo->prepare(
        'SELECT t.id, t.project_id, t.created_by, creator.name AS creator_name,
                t.assignee_id, assignee.name AS assignee_name, t.reviewer_id, reviewer.name AS reviewer_name, t.title, t.description, t.priority,
                t.due_date, t.is_done, t.completed_at,
                (p.user_id = :edit_owner OR (t.created_by = :edit_creator_own AND pm.can_edit_own_tasks = 1) OR (t.created_by <> :edit_creator_other AND pm.can_edit_other_tasks = 1) OR ts.can_edit = 1) AS can_edit,
                (p.user_id = :delete_owner OR (t.created_by = :delete_creator_own AND pm.can_delete_own_tasks = 1) OR (t.created_by <> :delete_creator_other AND pm.can_delete_other_tasks = 1) OR ts.can_delete = 1) AS can_delete,
                (p.user_id = :complete_owner OR t.created_by = :complete_creator OR t.assignee_id = :complete_assignee OR pm.can_complete_tasks = 1 OR ts.can_complete = 1) AS can_complete,
                (p.user_id = :comments_view_owner OR pm.can_view_comments = 1 OR ts.can_view_comments = 1) AS can_view_comments,
                (p.user_id = :comments_add_owner OR pm.can_add_comments = 1 OR ts.can_add_comments = 1) AS can_add_comments
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         INNER JOIN users creator ON creator.id = t.created_by
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_id
         LEFT JOIN task_shares ts ON ts.task_id = t.id AND ts.user_id = :share_user_id
         LEFT JOIN users assignee ON assignee.id = t.assignee_id
         LEFT JOIN users reviewer ON reviewer.id = t.reviewer_id
         WHERE (p.user_id = :owner_id OR (pm.user_id IS NOT NULL AND pm.can_view_tasks = 1) OR ts.can_view = 1) AND t.id = :task_id'
    );
    $statement->execute(['member_id' => $userId, 'share_user_id' => $userId, 'owner_id' => $userId, 'task_id' => $taskId,
        'edit_owner' => $userId, 'edit_creator_own' => $userId, 'edit_creator_other' => $userId,
        'delete_owner' => $userId, 'delete_creator_own' => $userId, 'delete_creator_other' => $userId,
        'complete_owner' => $userId, 'complete_creator' => $userId, 'complete_assignee' => $userId,
        'comments_view_owner' => $userId, 'comments_add_owner' => $userId]);
    $task = $statement->fetch();
    if (!is_array($task)) {
        throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
    }

    return tasko_task_data($task);
}
