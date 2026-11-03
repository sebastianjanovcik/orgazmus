<?php
declare(strict_types=1);

/** Vráti komentár v tvare API vrátane autora a oprávnenia mazať ho. */
function tasko_comment_data(array $row, int $userId): array
{
    return [
        'id' => (int) $row['id'],
        'task_id' => (int) $row['task_id'],
        'parent_id' => $row['parent_id'] === null ? null : (int) $row['parent_id'],
        'depth' => (int) $row['depth'],
        'body' => (string) $row['body'],
        'author' => ['id' => (int) $row['author_id'], 'name' => (string) $row['author_name']],
        'created_at' => (string) $row['created_at'],
        'can_delete' => (int) $row['author_id'] === $userId,
    ];
}

/** Načíta komentáre danej úlohy; hĺbka sa počíta z reťazca rodičov v databáze. */
function tasko_comments_find(PDO $pdo, int $taskId, int $userId): array
{
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
        static fn (array $row): array => tasko_comment_data($row, $userId),
        $statement->fetchAll()
    );
}
