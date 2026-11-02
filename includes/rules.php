<?php
declare(strict_types=1);

/** Vráti projektový limit Standard alebo null pre neobmedzený Premium. */
function tasko_project_limit(string $plan): ?int
{
    return match ($plan) {
        'standard' => 3,
        'premium' => null,
        default => throw new InvalidArgumentException('Neznámy plán používateľa.'),
    };
}

/** Overí, či plán povoľuje Premium komentáre. */
function tasko_plan_allows_comments(string $plan): bool
{
    return $plan === 'premium';
}

/** Použije pripravený dotaz na kontrolu limitu pred vložením ďalšieho projektu. */
function tasko_require_project_capacity(PDO $pdo, int $userId, string $plan): void
{
    $limit = tasko_project_limit($plan);
    if ($limit === null) {
        return;
    }

    $statement = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = :user_id');
    $statement->execute(['user_id' => $userId]);
    if ((int) $statement->fetchColumn() >= $limit) {
        throw new TaskoHttpException(403, 'plan_limit', 'Tvoj plán už dosiahol limit projektov.');
    }
}

/** Vyžaduje Premium a vráti jednotnú chybu API pri pokuse o použitie komentárov. */
function tasko_require_comment_access(string $plan): void
{
    if (!tasko_plan_allows_comments($plan)) {
        throw new TaskoHttpException(403, 'premium_required', 'Komentáre sú dostupné v pláne Premium.');
    }
}
