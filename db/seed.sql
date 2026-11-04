-- Ukážkové dáta pre spustenie cez phpMyAdmin po importe schema.sql.
-- Demo účty používajú heslo „password“; hash je kompatibilný s password_verify().
-- Seed je opakovateľný a nemení záznamy mimo pevných ID ukážky.
USE tasko;

START TRANSACTION;

INSERT INTO users (id, email, name, password_hash, plan) VALUES
    (1, 'jana@example.sk', 'Jana Nová', '$2y$10$K7mVvbbzAUOQbhLe2bRXfuP9S6wjJ7hA/lroIxbkdM0eD.pckdUHW', 'standard'),
    (2, 'premium@example.sk', 'Peter Prémiový', '$2y$10$K7mVvbbzAUOQbhLe2bRXfuP9S6wjJ7hA/lroIxbkdM0eD.pckdUHW', 'premium')
ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name),
    password_hash = VALUES(password_hash), plan = VALUES(plan);

INSERT INTO projects (id, user_id, name, description, icon, color) VALUES
    (10, 1, 'Práca', 'Pracovné úlohy', 'briefcase', '#6558d3'),
    (11, 1, 'Domácnosť', 'Veci na vybavenie doma', 'house', '#2f9e8f'),
    (12, 1, 'Osobné', 'Osobné ciele a nápady', 'star', '#e18b42'),
    (20, 2, 'Produkt', 'Príprava ďalšieho vydania', 'lightbulb', '#6558d3')
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), name = VALUES(name),
    description = VALUES(description), icon = VALUES(icon), color = VALUES(color);

-- Vlastník má vždy všetky oprávnenia; členstvo sa eviduje aj pre vlastníka.
INSERT INTO project_members (project_id, user_id, can_view_project, can_manage_project, can_manage_members,
    can_view_tasks, can_add_tasks, can_complete_tasks, can_edit_own_tasks, can_edit_other_tasks,
    can_delete_own_tasks, can_delete_other_tasks, can_view_comments, can_add_comments,
    can_edit_own_comments, can_edit_other_comments, can_delete_own_comments, can_delete_other_comments)
SELECT id, user_id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
FROM projects
ON DUPLICATE KEY UPDATE can_view_project = TRUE, can_manage_project = TRUE, can_manage_members = TRUE,
    can_view_tasks = TRUE, can_add_tasks = TRUE, can_complete_tasks = TRUE, can_edit_own_tasks = TRUE,
    can_edit_other_tasks = TRUE, can_delete_own_tasks = TRUE, can_delete_other_tasks = TRUE,
    can_view_comments = TRUE, can_add_comments = TRUE, can_edit_own_comments = TRUE,
    can_edit_other_comments = TRUE, can_delete_own_comments = TRUE, can_delete_other_comments = TRUE;

INSERT INTO tasks (id, project_id, created_by, title, description, priority, due_date, is_done, completed_at) VALUES
    (100, 10, 1, 'Pripraviť návrh', '<p>Prvá verzia návrhu na kontrolu.</p>', 3, '2026-11-06', FALSE, NULL),
    (101, 10, 1, 'Poslať podklady tímu', NULL, 2, '2026-11-03', TRUE, '2026-10-30 12:00:00'),
    (102, 11, 1, 'Kúpiť žiarovky', NULL, 1, '2026-11-08', FALSE, NULL),
    (103, 20, 2, 'Skontrolovať spätnú väzbu', '<p>Zhrnúť pripomienky z posledného kola.</p>', 4, '2026-11-05', FALSE, NULL)
ON DUPLICATE KEY UPDATE project_id = VALUES(project_id), created_by = VALUES(created_by), title = VALUES(title),
    description = VALUES(description), priority = VALUES(priority), due_date = VALUES(due_date),
    is_done = VALUES(is_done), completed_at = VALUES(completed_at);

INSERT INTO comments (id, task_id, parent_id, author_id, body) VALUES
    (1000, 103, NULL, 2, 'Začnem s prvou verziou ešte dnes.'),
    (1001, 103, 1000, 2, 'Dohodnuté, pošlem pripomienky zajtra.'),
    (1002, 103, NULL, 2, 'Zahrnúť aj komentáre z používateľských rozhovorov.')
ON DUPLICATE KEY UPDATE task_id = VALUES(task_id), parent_id = VALUES(parent_id),
    author_id = VALUES(author_id), body = VALUES(body);

COMMIT;
