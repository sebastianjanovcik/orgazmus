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

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
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
