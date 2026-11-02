# Spoločné PHP funkcie

Router v B3 má načítať `http.php` ako prvý (obsahuje `TaskoHttpException`) a
následne `validation.php`, `security.php`, `rules.php` a `database.php`.
Neočakávané výnimky odovzdá `tasko_handle_exception()`. Pomocné funkcie
databázy používajú PDO výnimky a pripravené príkazy; odpoveď klientovi
neobsahuje detaily spojenia ani serverové chyby.

Validátory vracajú `bool` alebo normalizovanú hodnotu; `null` označuje
neplatný vstup. `tasko_read_json_body()` vracia asociatívne polia z JSON
objektu a pri chybnom tele vyhodí `TaskoHttpException`. Popis úlohy sa pred
uložením sanitizuje na značky uvedené v API kontrakte.
