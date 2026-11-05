<?php
declare(strict_types=1);

/** Vráti komentár v tvare API vrátane autora a oprávnenia mazať ho. */
function tasko_comment_data(array $row, int $userId, bool $canEdit = false, bool $canDelete = false): array
{
    return [
        'id' => (int) $row['id'],
        'task_id' => (int) $row['task_id'],
        'parent_id' => $row['parent_id'] === null ? null : (int) $row['parent_id'],
        'depth' => (int) $row['depth'],
        'body' => (string) $row['body'],
        'author' => ['id' => (int) $row['author_id'], 'name' => (string) $row['author_name']],
        'created_at' => (string) $row['created_at'],
        'can_edit' => $canEdit,
        'can_delete' => $canDelete,
    ];
}

/** Načíta komentáre danej úlohy; hĺbka sa počíta z reťazca rodičov v databáze. */
function tasko_comments_find(PDO $pdo, int $taskId, int $userId): array
{
    $access = $pdo->prepare(
        'SELECT p.user_id AS owner_id, pm.can_edit_own_comments, pm.can_edit_other_comments,
                pm.can_delete_own_comments, pm.can_delete_other_comments,
                ts.can_edit_own_comments AS share_edit_own, ts.can_edit_other_comments AS share_edit_other,
                ts.can_delete_own_comments AS share_delete_own, ts.can_delete_other_comments AS share_delete_other
         FROM tasks t INNER JOIN projects p ON p.id = t.project_id
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :user_id
         LEFT JOIN task_shares ts ON ts.task_id = t.id AND ts.user_id = :share_user_id
         WHERE t.id = :task_id'
    );
    $access->execute(['user_id' => $userId, 'share_user_id' => $userId, 'task_id' => $taskId]);
    $rights = $access->fetch() ?: [];
    $statement = $pdo->prepare(
        'WITH RECURSIVE comment_tree AS (
            SELECT id, task_id, parent_id, author_id, body, created_at, 0 AS depth
            FROM comments WHERE task_id = :task_id AND parent_id IS NULL
            UNION ALL
            SELECT child.id, child.task_id, child.parent_id, child.author_id, child.body, child.created_at,
                   parent.depth + 1
            FROM comments child
            INNER JOIN comment_tree parent ON child.parent_id = parent.id AND child.task_id = parent.task_id
         )
         SELECT tree.id, tree.task_id, tree.parent_id, tree.author_id, tree.body, tree.created_at, tree.depth,
                users.name AS author_name
         FROM comment_tree tree
         INNER JOIN users ON users.id = tree.author_id
         ORDER BY tree.created_at ASC, tree.id ASC'
    );
    $statement->execute(['task_id' => $taskId]);

    return array_map(
        static function (array $row) use ($userId, $rights): array {
            $owner = (int) ($rights['owner_id'] ?? 0) === $userId;
            $own = (int) $row['author_id'] === $userId;
            return tasko_comment_data($row, $userId, $owner || (bool) ($rights[$own ? 'can_edit_own_comments' : 'can_edit_other_comments'] ?? false) || (bool) ($rights[$own ? 'share_edit_own' : 'share_edit_other'] ?? false),
                $owner || (bool) ($rights[$own ? 'can_delete_own_comments' : 'can_delete_other_comments'] ?? false) || (bool) ($rights[$own ? 'share_delete_own' : 'share_delete_other'] ?? false));
        },
        $statement->fetchAll()
    );
}
