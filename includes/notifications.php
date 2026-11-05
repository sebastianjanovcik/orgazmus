<?php
declare(strict_types=1);

/** Uloží nemenný záznam zmeny; IP berie iba z priameho spojenia, nie z nedôveryhodných proxy hlavičiek. */
function tasko_record_audit_event(PDO $pdo, ?int $projectId, string $entityType, ?int $entityId, ?int $actorId, string $event, array $details): void
{
    $remoteAddress = $_SERVER['REMOTE_ADDR'] ?? null;
    $ipAddress = is_string($remoteAddress) && filter_var($remoteAddress, FILTER_VALIDATE_IP) ? $remoteAddress : null;
    $audit = $pdo->prepare('INSERT INTO audit_log (project_id, entity_type, entity_id, actor_id, ip_address, event_type, details) VALUES (:project_id, :entity_type, :entity_id, :actor_id, :ip_address, :event_type, :details)');
    $audit->execute([
        'project_id' => $projectId,
        'entity_type' => $entityType,
        'entity_id' => $entityId,
        'actor_id' => $actorId,
        'ip_address' => $ipAddress,
        'event_type' => $event,
        'details' => json_encode($details, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
    ]);
}

/** Uloží projektovú udalosť aj notifikácie v rámci aktuálnej transakcie. */
function tasko_record_project_event(PDO $pdo, int $projectId, ?int $actorId, string $event, array $details, array $recipients = []): void
{
    $entityType = str_starts_with($event, 'invitation_') ? 'invitation' : (in_array($event, ['member_removed', 'permissions_changed'], true) ? 'membership' : 'project');
    $entityId = str_starts_with($event, 'invitation_') && isset($details['invitation_id'])
        ? (int) $details['invitation_id']
        : (isset($details['member_id']) ? (int) $details['member_id'] : $projectId);
    $auditDetails = isset($details['changes']) ? $details : ['snapshot' => $details];
    tasko_record_audit_event($pdo, $projectId, $entityType, $entityId, $actorId, $event, $auditDetails);

    $messages = [
        'invitation_created' => 'Bola vytvorená pozvánka do projektu.',
        'invitation_revoked' => 'Pozvánka do projektu bola odvolaná.',
        'invitation_accepted' => 'Pozvánka do projektu bola prijatá.',
        'member_removed' => 'Bol odobratý člen projektu.',
        'permissions_changed' => 'Zmenili sa tvoje oprávnenia v projekte.',
        'ownership_transferred' => 'Vlastníctvo projektu bolo prevedené.',
    ];
    $notice = $pdo->prepare('INSERT INTO notifications (user_id, project_id, event_type, message) VALUES (:user_id, :project_id, :event_type, :message)');
    foreach (array_unique(array_filter($recipients, static fn ($id): bool => is_int($id) && $id > 0)) as $recipientId) {
        if ($actorId !== null && $recipientId === $actorId) continue;
        $notice->execute([
            'user_id' => $recipientId,
            'project_id' => $projectId,
            'event_type' => $event,
            'message' => $messages[$event] ?? 'V projekte nastala zmena.',
        ]);
    }
}

/** Stránkuje iba notifikácie prihláseného účtu; kurzor je ID posledného zobrazeného riadka. */
function tasko_user_notifications(PDO $pdo, int $userId, int $beforeId, int $limit): array
{
    $cursor = $beforeId > 0 ? ' AND id < :before_id' : '';
    $query = $pdo->prepare(
        'SELECT id, project_id, event_type, message, is_read, created_at
         FROM notifications WHERE user_id = :user_id' . $cursor . ' ORDER BY id DESC LIMIT :row_limit'
    );
    $query->bindValue(':user_id', $userId, PDO::PARAM_INT);
    if ($beforeId > 0) $query->bindValue(':before_id', $beforeId, PDO::PARAM_INT);
    $query->bindValue(':row_limit', $limit, PDO::PARAM_INT);
    $query->execute();
    return array_map(static fn (array $row): array => [
        'id' => (int) $row['id'], 'project_id' => $row['project_id'] === null ? null : (int) $row['project_id'],
        'event_type' => (string) $row['event_type'], 'message' => (string) $row['message'],
        'is_read' => (bool) $row['is_read'], 'created_at' => (new DateTimeImmutable((string) $row['created_at'], new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s\\Z'),
    ], $query->fetchAll());
}
