<?php
declare(strict_types=1);

/** Výnimka prenáša bezpečnú odpoveď pre klienta medzi pomocnými funkciami a routerom. */
final class TaskoHttpException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $fields = []
    ) {
        parent::__construct($message);
    }
}

/** Vráti jednotnú JSON obálku; odpovede bez obsahu rešpektujú sémantiku HTTP 204. */
function tasko_json_response(int $status, mixed $data = null): never
{
    http_response_code($status);
    if ($status === 204) {
        exit;
    }

    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    try {
        echo json_encode(['data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        error_log('Tasko: úspešnú odpoveď nebolo možné zakódovať: ' . $error->getMessage());
        http_response_code(500);
        echo '{"error":{"code":"server_error","message":"Nastala chyba servera.","fields":{}}}';
    }
    exit;
}

/** Vráti chybovú JSON obálku so stabilným tvarom poľa fields. */
function tasko_json_error(int $status, string $code, string $message, array $fields = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode([
        'error' => [
            'code' => $code,
            'message' => $message,
            'fields' => (object) $fields,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Prevedie známe API výnimky na odpoveď a nečakané chyby bezpečne zaloguje. */
function tasko_handle_exception(Throwable $error): never
{
    if ($error instanceof TaskoHttpException) {
        tasko_json_error($error->status, $error->errorCode, $error->getMessage(), $error->fields);
    }

    error_log('Tasko: neočakávaná chyba: ' . $error);
    tasko_json_error(500, 'server_error', 'Nastala chyba servera.');
}

/** Načíta JSON objekt požiadavky a odmietne chybné JSON, príliš veľké telo aj polia. */
function tasko_read_json_body(int $maximumBytes = 1_048_576): array
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > $maximumBytes) {
        throw new TaskoHttpException(413, 'payload_too_large', 'Požiadavka je príliš veľká.');
    }

    $body = file_get_contents('php://input', false, null, 0, $maximumBytes + 1);
    if ($body === false || strlen($body) > $maximumBytes) {
        throw new TaskoHttpException(413, 'payload_too_large', 'Požiadavka je príliš veľká.');
    }

    try {
        $decoded = json_decode($body, false, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new TaskoHttpException(400, 'bad_request', 'Telo požiadavky musí obsahovať platný JSON objekt.');
    }

    if (!$decoded instanceof stdClass) {
        throw new TaskoHttpException(400, 'bad_request', 'Telo požiadavky musí obsahovať platný JSON objekt.');
    }

    return get_object_vars($decoded);
}
