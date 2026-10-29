<?php
/**
 * Minimálny verejný vstupný bod aplikácie pred tvorbou používateľského rozhrania.
 * Webový server má ako koreň nastavený výhradne priečinok public/.
 */
?><!doctype html>
<html lang="sk">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="/assets/img/tasko.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css">
    <link rel="stylesheet" href="/assets/css/app.css">
    <title>Tasko</title>
</head>
<body>
    <main>
        <h1>Tasko</h1>
        <p>Príprava aplikácie prebieha.</p>
    </main>
    <!-- Knižnice sa načítajú z lokálnych súborov, aby stránka nepotrebovala CDN. -->
    <script src="/assets/vendor/jquery/jquery.min.js"></script>
    <script src="/assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
    <script src="/assets/vendor/fullcalendar/index.global.min.js"></script>
    <script src="/assets/js/app.js"></script>
</body>
</html>
