<?php
declare(strict_types=1);

/** Počíta znaky UTF-8 aj bez rozšírenia mbstring a odmietne neplatné kódovanie. */
function tasko_text_length(string $value): ?int
{
    $matches = [];
    return preg_match_all('/./us', $value, $matches) === false ? null : count($matches[0]);
}

/** Vráti orezané meno v rozsahu API alebo null pri neplatnom vstupe. */
function tasko_validate_name(mixed $value, int $maximum = 60): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $value = trim($value);
    $length = tasko_text_length($value);
    return $length !== null && $length >= 1 && $length <= $maximum ? $value : null;
}

/** Normalizuje e-mail na malé písmená a overí jeho tvar aj databázovú dĺžku. */
function tasko_validate_email(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $email = strtolower(trim($value));
    return strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false ? $email : null;
}

/** Heslo kontroluje v bajtoch, ako vyžaduje limit password_hash a API kontrakt. */
function tasko_validate_password(mixed $value): bool
{
    return is_string($value) && strlen($value) >= 8 && strlen($value) <= 72;
}

/** Prijíma iba skutočný kalendárny dátum presne vo formáte YYYY-MM-DD. */
function tasko_validate_date(mixed $value): bool
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
        return false;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    $errors = DateTimeImmutable::getLastErrors();
    return $date !== false
        && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))
        && $date->format('Y-m-d') === $value;
}

/** Overí celé číslo priority bez akceptovania desatinných alebo numerických textov. */
function tasko_validate_priority(mixed $value): bool
{
    return (is_int($value) || (is_string($value) && preg_match('/^[1-4]$/D', $value) === 1))
        && filter_var($value, FILTER_VALIDATE_INT) !== false
        && (int) $value >= 1
        && (int) $value <= 4;
}

/** Overí kladné celočíselné ID z JSON alebo URL bez pretečenia PHP integeru. */
function tasko_validate_id(mixed $value): bool
{
    if (!(is_int($value) || (is_string($value) && preg_match('/^[1-9]\d*$/D', $value) === 1))) {
        return false;
    }
    return filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false;
}

/** Skontroluje limity textu podľa API a vráti orezanú hodnotu alebo null. */
function tasko_validate_project_description(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $value = trim($value);
    $length = tasko_text_length($value);
    return $length !== null && $length <= 200 ? $value : null;
}

/** Pripraví popis úlohy ako bezpečný HTML fragment alebo null pri prázdnom vstupe. */
function tasko_validate_task_description(mixed $value): ?string
{
    if ($value === null) {
        return null;
    }
    if (!is_string($value)) {
        return null;
    }
    $length = tasko_text_length($value);
    if ($length === null || $length > 2000) {
        return null;
    }
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    $sanitized = tasko_sanitize_description($value);
    return trim($sanitized) === '' ? null : $sanitized;
}

/** Vráti komentár po orezaní, ak obsahuje 1 až 1 000 znakov. */
function tasko_validate_comment_body(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $value = trim($value);
    $length = tasko_text_length($value);
    return $length !== null && $length >= 1 && $length <= 1000 ? $value : null;
}
