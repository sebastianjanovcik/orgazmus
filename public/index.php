<?php
/**
 * Zachováva PHP vstupný bod používaný lokálnym serverom a servíruje statickú
 * kostru F3; aplikačné dáta a správanie doplnia ďalšie kroky plánu.
 */
// Prehliadač a prípadná proxy si pri každom otvorení overia aktuálnu verziu HTML.
header('Cache-Control: no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

readfile(__DIR__ . '/index.html');
