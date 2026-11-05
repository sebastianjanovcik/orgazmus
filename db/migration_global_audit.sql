-- Jednorazové rozšírenie projektového auditu na celý systém.
USE tasko;

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

-- Spusti iba raz: prenesie doterajšie udalosti a ponechá pôvodnú tabuľku ako zálohu.
INSERT INTO audit_log (project_id, entity_type, entity_id, actor_id, event_type, details, created_at)
SELECT project_id, 'project', project_id, actor_id, event_type, details, created_at
FROM project_audit_log;
