-- Jednorazový upgrade databázy vytvorenej pred krokom 1 správy členstva.
-- Zálohuj databázu a vykonaj tento súbor pred nasadením nového PHP kódu.
USE tasko;

CREATE TABLE project_members (
    project_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    can_view_project BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_project BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_members BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_add_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_complete_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_own_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_other_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_own_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_other_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_add_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_own_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_other_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_own_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_other_comments BOOLEAN NOT NULL DEFAULT FALSE,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id),
    KEY idx_project_members_user (user_id, project_id),
    CONSTRAINT fk_project_members_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_project_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Doterajší vlastník je jediným členom a dostane úplné oprávnenia.
INSERT INTO project_members (project_id, user_id, can_view_project, can_manage_project, can_manage_members,
    can_view_tasks, can_add_tasks, can_complete_tasks, can_edit_own_tasks, can_edit_other_tasks,
    can_delete_own_tasks, can_delete_other_tasks, can_view_comments, can_add_comments,
    can_edit_own_comments, can_edit_other_comments, can_delete_own_comments, can_delete_other_comments)
SELECT id, user_id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
FROM projects;

-- Dočasná nullable kolóna umožní prevziať autora zo súčasného vlastníka projektu.
ALTER TABLE tasks ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER project_id;
UPDATE tasks t INNER JOIN projects p ON p.id = t.project_id SET t.created_by = p.user_id;
ALTER TABLE tasks MODIFY created_by BIGINT UNSIGNED NOT NULL,
    ADD CONSTRAINT fk_tasks_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE;
