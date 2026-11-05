-- Jednorazové rozšírenie existujúcej databázy o priradenia a samostatné zdieľanie úloh.
ALTER TABLE tasks
    ADD COLUMN assignee_id BIGINT UNSIGNED NULL AFTER created_by,
    ADD COLUMN reviewer_id BIGINT UNSIGNED NULL AFTER assignee_id,
    ADD KEY idx_tasks_assignee (assignee_id),
    ADD KEY idx_tasks_reviewer (reviewer_id),
    ADD CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_tasks_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE task_shares (
    task_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    can_complete BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_add_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_own_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_other_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_own_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_other_comments BOOLEAN NOT NULL DEFAULT FALSE,
    shared_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, user_id),
    KEY idx_task_shares_user (user_id, task_id),
    CONSTRAINT fk_task_shares_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_task_shares_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_task_shares_actor FOREIGN KEY (shared_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;
