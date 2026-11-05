-- Základná lokálna schéma Tasko; opakovaný import obnoví štruktúru tabuliek.
CREATE DATABASE IF NOT EXISTS tasko
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE tasko;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) NOT NULL,
    name VARCHAR(60) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    plan ENUM('standard', 'premium') NOT NULL DEFAULT 'standard',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS projects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(40) NOT NULL,
    description VARCHAR(200) NOT NULL DEFAULT '',
    icon VARCHAR(32) NOT NULL,
    color CHAR(7) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_projects_user_name (user_id, name),
    KEY idx_projects_user (user_id, id),
    CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_projects_color CHECK (color REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE=InnoDB;

-- Každý projekt má jedného vlastníka a samostatné riadky pre ďalších členov.
CREATE TABLE IF NOT EXISTS project_members (
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

-- Pozvánky uchovávajú iba hash tajného tokenu; pending riadok ešte neudeľuje prístup.
CREATE TABLE IF NOT EXISTS project_invitations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    invited_email VARCHAR(254) NOT NULL,
    invited_user_id BIGINT UNSIGNED NULL,
    invited_by BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    status ENUM('pending', 'accepted', 'declined', 'revoked', 'expired') NOT NULL DEFAULT 'pending',
    can_view_project BOOLEAN NOT NULL DEFAULT TRUE,
    can_manage_project BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_members BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_tasks BOOLEAN NOT NULL DEFAULT TRUE,
    can_add_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_complete_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_own_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_other_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_own_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_other_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_comments BOOLEAN NOT NULL DEFAULT TRUE,
    can_add_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_own_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_other_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_own_comments BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete_other_comments BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_project_invitation_token (token_hash),
    KEY idx_project_invitations_project (project_id, status, expires_at),
    KEY idx_project_invitations_email (invited_email, status, expires_at),
    CONSTRAINT fk_project_invitations_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_project_invitations_user FOREIGN KEY (invited_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_project_invitations_inviter FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Spoločný append-only denník uchová aj udalosti bez projektu a po zmazaní projektu.
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,
    actor_id BIGINT UNSIGNED NULL,
    ip_address VARCHAR(45) NULL,
    event_type VARCHAR(80) NOT NULL,
    details JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_project_page (project_id, id),
    KEY idx_audit_actor_page (actor_id, id),
    KEY idx_audit_entity_page (entity_type, id),
    KEY idx_audit_created (created_at, id),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Notifikácie patria jedinému príjemcovi; značka prečítania sa nastavuje až po vykreslení záznamu.
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NULL,
    event_type VARCHAR(60) NOT NULL,
    message VARCHAR(255) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_notifications_user_page (user_id, id),
    KEY idx_notifications_unread (user_id, is_read, id),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NULL,
    priority TINYINT UNSIGNED NOT NULL DEFAULT 2,
    due_date DATE NOT NULL,
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_tasks_project_state_date (project_id, is_done, due_date, priority, id),
    KEY idx_tasks_due_date (due_date),
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_tasks_priority CHECK (priority BETWEEN 1 AND 4),
    CONSTRAINT chk_tasks_completion CHECK (
        (is_done = FALSE AND completed_at IS NULL) OR
        (is_done = TRUE AND completed_at IS NOT NULL)
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    task_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    body VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_comments_id_task (id, task_id),
    KEY idx_comments_task_created (task_id, created_at, id),
    KEY idx_comments_parent_task (parent_id, task_id),
    KEY idx_comments_author (author_id),
    CONSTRAINT fk_comments_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    -- Zložený kľúč nedovolí pripojiť odpoveď ku komentáru inej úlohy.
    CONSTRAINT fk_comments_parent_task FOREIGN KEY (parent_id, task_id)
        REFERENCES comments (id, task_id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_comments_body CHECK (CHAR_LENGTH(TRIM(body)) BETWEEN 1 AND 1000)
) ENGINE=InnoDB;
