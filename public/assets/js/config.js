/* Nastavenia sú verejné; prípadný Postman API kľúč patrí iba do lokálneho ignorovaného súboru. */
// Základ API odvodíme z umiestnenia config.js, aby fungoval aj pri servírovaní /public/ z XAMPP.
const taskoConfigScript = document.currentScript ? new URL(document.currentScript.src) : null;
const taskoPublicRoot = taskoConfigScript ? new URL('../..', taskoConfigScript) : new URL('/', window.location.href);

window.TASKO_CONFIG = {
    // Frontend aj API zostávajú na rovnakom origine; cesta rešpektuje koreň /public/.
    apiBase: `${taskoPublicRoot.origin}${taskoPublicRoot.pathname.replace(/\/$/, '')}`,
    demoMode: false
};
