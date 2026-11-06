<?php
declare(strict_types=1);

/** Vráti súkromný koreň príloh a odmietne konfiguráciu smerujúcu do webrootu. */
function tasko_attachment_storage_directory(): string
{
    $config = require __DIR__ . '/../config/config.php';
    $configured = $config['attachments']['directory'] ?? dirname(__DIR__) . '/var/attachments';
    if (!is_string($configured) || $configured === '') {
        throw new TaskoHttpException(500, 'storage_error', 'Súkromné úložisko príloh nie je nakonfigurované.');
    }
    if (!is_dir($configured) && !@mkdir($configured, 0700, true) && !is_dir($configured)) {
        throw new TaskoHttpException(500, 'storage_error', 'Súkromné úložisko príloh nie je dostupné.');
    }
    @chmod($configured, 0700);
    $directory = realpath($configured);
    $public = realpath(__DIR__ . '/../public');
    if ($directory === false || $public === false || str_starts_with(strtolower($directory . DIRECTORY_SEPARATOR), strtolower($public . DIRECTORY_SEPARATOR))) {
        throw new TaskoHttpException(500, 'storage_error', 'Súkromné úložisko musí byť mimo verejného koreňa.');
    }
    if (!is_writable($directory)) {
        throw new TaskoHttpException(500, 'storage_error', 'Súkromné úložisko príloh nie je zapisovateľné.');
    }
    return $directory;
}

/** Vytvorí stabilný verejný objekt bez interného kľúča súboru ani absolútnej cesty. */
function tasko_attachment_data(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => (string) $row['original_name'],
        'mime_type' => (string) $row['mime_type'],
        'size' => (int) $row['byte_size'],
        'author' => $row['author_id'] === null ? null : [
            'id' => (int) $row['author_id'],
            'name' => (string) $row['author_name'],
        ],
        'created_at' => (new DateTimeImmutable((string) $row['created_at'], new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z'),
    ];
}

/** Rozpozná povolený formát podľa podpisu a štruktúry obsahu, nie podľa hlavičky prehliadača. */
function tasko_attachment_detect_mime(string $path, string $extension): ?string
{
    $allowed = [
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pdf' => 'application/pdf',
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
        'gif' => 'image/gif', 'webp' => 'image/webp',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    if (!isset($allowed[$extension])) return null;

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $detected = $finfo->file($path);
    if (!is_string($detected)) return null;
    $head = file_get_contents($path, false, null, 0, 16);
    if (!is_string($head)) return null;

    if ($extension === 'pdf') {
        return str_starts_with($head, '%PDF-') && $detected === 'application/pdf' ? $allowed[$extension] : null;
    }
    if (in_array($extension, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
        $image = @getimagesize($path);
        if (!is_array($image) || ($image['mime'] ?? null) !== $allowed[$extension] || $detected !== $allowed[$extension]) return null;
        if (!function_exists('imagecreatefromstring')) return null;
        $decoded = @imagecreatefromstring((string) file_get_contents($path));
        if ($decoded === false) return null;
        imagedestroy($decoded);
        return $allowed[$extension];
    }

    if (in_array($extension, ['docx', 'xlsx', 'pptx'], true)) {
        if (!class_exists(ZipArchive::class) || !str_starts_with($head, "PK\x03\x04")) return null;
        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::CHECKCONS) !== true) return null;
        $required = match ($extension) {
            'docx' => 'word/document.xml', 'xlsx' => 'xl/workbook.xml', 'pptx' => 'ppt/presentation.xml',
        };
        $valid = $zip->locateName('[Content_Types].xml') !== false
            && $zip->locateName($required) !== false
            && $zip->locateName('vbaProject.bin') === false;
        $zip->close();
        return $valid ? $allowed[$extension] : null;
    }

    // Staršie formáty Office používajú spoločný OLE podpis; vnútorný názov streamu ich rozlíši.
    if (!str_starts_with($head, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1")) return null;
    $contents = file_get_contents($path);
    if (!is_string($contents)) return null;
    $signature = match ($extension) {
        'doc' => 'WordDocument', 'xls' => (str_contains($contents, 'Workbook') || str_contains($contents, 'Book')),
        'ppt' => 'PowerPoint Document', default => false,
    };
    $valid = is_string($signature) ? str_contains($contents, $signature) : $signature;
    return $valid ? $allowed[$extension] : null;
}

/** Orezáva klientský názov na bezpečný zobrazovací údaj; názov nikdy nevstupuje do cesty. */
function tasko_attachment_display_name(string $name): ?string
{
    if (!preg_match('//u', $name)) return null;
    $name = basename(str_replace('\\', '/', $name));
    $name = trim((string) preg_replace('/[\x00-\x1F\x7F]/u', '', $name));
    if ($name === '' || str_contains($name, '/') || str_contains($name, '\\')) return null;
    if (preg_match('/^(.{1,255})/us', $name, $match) !== 1) return null;
    return $match[1];
}

/** Vráti zoradený zoznam metadát až po samostatnej kontrole prístupu k nadradenej úlohe. */
function tasko_attachments_find(PDO $pdo, int $taskId): array
{
    $query = $pdo->prepare(
        'SELECT a.id, a.author_id, a.author_name, a.original_name, a.mime_type, a.byte_size, a.created_at
         FROM task_attachments a WHERE a.task_id = :task_id ORDER BY a.created_at, a.id'
    );
    $query->execute(['task_id' => $taskId]);
    return array_map('tasko_attachment_data', $query->fetchAll());
}

/** Nahrá jeden bezpečne overený súbor; riadok aj fyzický súbor vzniknú ako jedna operácia. */
function tasko_attachment_create(PDO $pdo, int $taskId, array $user): array
{
    if (($_SERVER['CONTENT_LENGTH'] ?? '') !== '' && (int) $_SERVER['CONTENT_LENGTH'] > 35_651_584) {
        throw new TaskoHttpException(413, 'file_too_large', 'Súbor prekračuje limit 32 MB.');
    }
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($contentType, 'multipart/form-data;')) {
        throw new TaskoHttpException(415, 'unsupported_media_type', 'Nahratie vyžaduje multipart/form-data.');
    }
    if (array_keys($_FILES) !== ['file'] || $_POST !== []) {
        throw new TaskoHttpException(422, 'validation_failed', 'Požiadavka môže obsahovať iba jedno pole file.');
    }
    $upload = $_FILES['file'];
    if (!is_array($upload) || is_array($upload['name'] ?? null)) {
        throw new TaskoHttpException(422, 'upload_required', 'Vyber jeden súbor na nahratie.');
    }
    $error = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) throw new TaskoHttpException(422, 'upload_required', 'Vyber jeden súbor na nahratie.');
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) throw new TaskoHttpException(413, 'file_too_large', 'Súbor prekračuje limit 32 MB.');
    if ($error !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($upload['tmp_name'] ?? ''))) {
        throw new TaskoHttpException(422, 'validation_failed', 'Súbor sa nepodarilo prijať. Skús ho vybrať znova.');
    }
    $path = (string) $upload['tmp_name'];
    $size = filesize($path);
    $name = tasko_attachment_display_name((string) ($upload['name'] ?? ''));
    if (!is_int($size) || $size < 1) throw new TaskoHttpException(422, 'validation_failed', 'Prázdne súbory nie je možné pridať.');
    if ($size > 33_554_432) throw new TaskoHttpException(413, 'file_too_large', 'Súbor prekračuje limit 32 MB.');
    if ($name === null) throw new TaskoHttpException(422, 'validation_failed', 'Názov súboru nie je platný.');
    $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $mimeType = tasko_attachment_detect_mime($path, $extension);
    if ($mimeType === null) throw new TaskoHttpException(422, 'invalid_file_type', 'Typ súboru nie je povolený alebo obsah nezodpovedá prípone.');

    $storageDirectory = tasko_attachment_storage_directory();
    $pdo->beginTransaction();
    $storagePath = null;
    try {
        // Zámok nadradenej úlohy serializuje uploady, aby súbežné požiadavky neobišli 1 GB limit.
        $taskLock = $pdo->prepare('SELECT id FROM tasks WHERE id = :task_id FOR UPDATE');
        $taskLock->execute(['task_id' => $taskId]);
        if ($taskLock->fetchColumn() === false) throw new TaskoHttpException(404, 'not_found', 'Úloha sa nenašla.');
        $total = $pdo->prepare('SELECT COALESCE(SUM(byte_size), 0) FROM task_attachments WHERE task_id = :task_id');
        $total->execute(['task_id' => $taskId]);
        if ((int) $total->fetchColumn() + $size > 1_073_741_824) {
            throw new TaskoHttpException(413, 'task_attachment_limit', 'Súčet príloh úlohy nesmie prekročiť 1 GB.');
        }

        $storageKey = bin2hex(random_bytes(32));
        $storagePath = $storageDirectory . DIRECTORY_SEPARATOR . $storageKey;
        if (!move_uploaded_file($path, $storagePath)) throw new TaskoHttpException(500, 'storage_error', 'Súbor sa nepodarilo uložiť do súkromného úložiska.');
        @chmod($storagePath, 0600);
        $insert = $pdo->prepare(
            'INSERT INTO task_attachments (task_id, author_id, author_name, storage_key, original_name, mime_type, byte_size)
             VALUES (:task_id, :author_id, :author_name, :storage_key, :original_name, :mime_type, :byte_size)'
        );
        $insert->execute([
            'task_id' => $taskId, 'author_id' => (int) $user['id'], 'author_name' => (string) $user['name'],
            'storage_key' => $storageKey, 'original_name' => $name, 'mime_type' => $mimeType, 'byte_size' => $size,
        ]);
        $id = (int) $pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($storagePath !== null && is_file($storagePath)) @unlink($storagePath);
        throw $error;
    }

    $query = $pdo->prepare('SELECT id, author_id, author_name, original_name, mime_type, byte_size, created_at FROM task_attachments WHERE id = :id');
    $query->execute(['id' => $id]);
    $row = $query->fetch();
    if (!is_array($row)) throw new TaskoHttpException(500, 'storage_error', 'Metadáta prílohy sa nepodarilo načítať.');
    return tasko_attachment_data($row);
}
