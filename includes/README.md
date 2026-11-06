# Spoločné PHP funkcie

Router má načítať `http.php` ako prvý (obsahuje `TaskoHttpException`) a
následne `validation.php`, `security.php`, `rules.php`, `database.php`,
`tasks.php`, `comments.php`, `notifications.php` a `attachments.php`.
Neočakávané výnimky odovzdá `tasko_handle_exception()`. Pomocné funkcie
databázy používajú PDO výnimky a pripravené príkazy; odpoveď klientovi
neobsahuje detaily spojenia ani serverové chyby.

`attachments.php` kontroluje typ podľa obsahu a veľkosť uploadu, ukladá súbory
pod náhodným kľúčom mimo webrootu a poskytuje opakovateľné spracovanie mazacieho
outboxu. Verejná serializácia nikdy nevracia cestu ani interný kľúč úložiska.

Validátory vracajú `bool` alebo normalizovanú hodnotu; `null` označuje
neplatný vstup. `tasko_read_json_body()` vracia asociatívne polia z JSON
objektu a pri chybnom tele vyhodí `TaskoHttpException`. Popis úlohy sa pred
uložením sanitizuje na značky uvedené v API kontrakte.
