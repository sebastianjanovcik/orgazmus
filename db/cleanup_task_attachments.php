<?php
declare(strict_types=1);

/** CLI úloha opakuje mazanie súborov, ktoré dočasne zlyhalo počas API požiadavky. */
require_once __DIR__ . '/../includes/http.php';
require_once __DIR__ . '/../includes/database.php';
require_once __DIR__ . '/../includes/attachments.php';

try {
    $removed = tasko_attachment_process_cleanup(tasko_db(), 500);
    fwrite(STDOUT, "Odstránené súbory príloh: $removed\n");
} catch (Throwable $error) {
    fwrite(STDERR, "Upratovanie príloh zlyhalo; položky zostali vo fronte.\n");
    error_log('Tasko: CLI upratovanie príloh zlyhalo: ' . $error->getMessage());
    exit(1);
}
