-- Metadáta príloh. Fyzické súbory zostávajú v súkromnom adresári mimo webrootu.
CREATE TABLE IF NOT EXISTS task_attachments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    task_id BIGINT UNSIGNED NOT NULL,
    author_id BIGINT UNSIGNED NULL,
    author_name VARCHAR(60) NOT NULL,
    storage_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(127) NOT NULL,
    byte_size BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_task_attachments_storage_key (storage_key),
    KEY idx_task_attachments_task (task_id, created_at, id),
    CONSTRAINT fk_task_attachments_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_task_attachments_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_task_attachments_size CHECK (byte_size BETWEEN 1 AND 33554432)
) ENGINE=InnoDB;

-- Mazacie požiadavky pretrvajú reštart alebo dočasný výpadok disku a dajú sa opakovať.
CREATE TABLE IF NOT EXISTS task_attachment_cleanup (
    storage_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    queued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (storage_key),
    KEY idx_task_attachment_cleanup_queued (queued_at)
) ENGINE=InnoDB;
