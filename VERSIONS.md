# Verzie nástrojov a knižníc

Zistené 29. 10. 2026 v lokálnom vývojovom prostredí.

| Nástroj alebo knižnica | Verzia/stav | Pôvod alebo poznámka |
| --- | --- | --- |
| PHP CLI | 8.5.12 | `php -v` |
| Git | 2.54.0.windows.1 | `git --version` |
| MySQL klient | Nedostupný | Príkaz `mysql` sa v PATH nenašiel; verzia servera nebola overená. |
| Bootstrap | 5.3.8 | Aktívne súbory sú v `public/assets/vendor/bootstrap/`; pôvodné varianty sú odložené v `trash/assets/`. |
| jQuery | 4.0.0 | `public/assets/vendor/jquery/`; lokálna minifikovaná distribúcia z oficiálnej stránky jQuery. |
| FullCalendar | 6.1.19 | `public/assets/vendor/fullcalendar/`; globálna minifikovaná distribúcia z balíka npm cez jsDelivr. |

Používateľská stránka odkazuje na lokálne súbory; pri bežnom spustení preto
nepotrebuje CDN. Verzie zodpovedajú súborom uloženým v repozitári.
