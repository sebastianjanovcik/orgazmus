/* Verejné nastavenia určujú, že frontend používa PHP API na rovnakom hoste. */
const taskoConfigScript = document.currentScript ? new URL(document.currentScript.src) : null;
const taskoPublicRoot = taskoConfigScript
    ? new URL('../..', taskoConfigScript)
    : new URL('/', window.location.href);

window.TASKO_CONFIG = {
    // Odvodenie koreňa zo skriptu funguje aj pri nasadení aplikácie v podpriečinku /public/.
    apiBase: `${taskoPublicRoot.origin}${taskoPublicRoot.pathname.replace(/\/$/, '')}`,
    demoMode: false
};
