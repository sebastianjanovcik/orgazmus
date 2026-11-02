<?php
declare(strict_types=1);

/** Vstavaný PHP server posiela API cesty do front controllera a statiku obslúži sám. */
$requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);

if (is_string($requestPath) && preg_match('#^/api(?:/|$)#', $requestPath) === 1) {
    require __DIR__ . '/api/index.php';
    return true;
}

return false;
