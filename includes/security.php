<?php
declare(strict_types=1);

/** Escapuje nedôveryhodný text pre vloženie do HTML v kódovaní UTF-8. */
function tasko_escape_html(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Odstráni zakázané HTML značky a atribúty; zachová len bezpečné formátovanie popisu. */
function tasko_sanitize_description(string $html): string
{
    $document = new DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    $loaded = $document->loadHTML(
        '<?xml encoding="UTF-8"><div id="tasko-description-root">' . $html . '</div>',
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
    );
    libxml_clear_errors();
    libxml_use_internal_errors($previous);

    $root = $loaded ? $document->getElementById('tasko-description-root') : null;
    if (!$root instanceof DOMElement) {
        return tasko_escape_html($html);
    }

    $allowed = ['b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'br', 'p'];
    tasko_sanitize_node_children($root, $allowed);

    $result = '';
    foreach ($root->childNodes as $child) {
        $result .= $document->saveHTML($child);
    }
    return $result;
}

/** Odstráni skripty úplne, unwrapne cudzie značky a z povolených zmaže atribúty. */
function tasko_sanitize_node_children(DOMNode $parent, array $allowed): void
{
    for ($node = $parent->firstChild; $node !== null;) {
        $next = $node->nextSibling;
        if ($node instanceof DOMComment) {
            $parent->removeChild($node);
        } elseif ($node instanceof DOMElement) {
            $tag = strtolower($node->tagName);
            if (in_array($tag, ['script', 'style'], true)) {
                $parent->removeChild($node);
            } elseif (!in_array($tag, $allowed, true)) {
                tasko_sanitize_node_children($node, $allowed);
                while ($node->firstChild !== null) {
                    $parent->insertBefore($node->firstChild, $node);
                }
                $parent->removeChild($node);
            } else {
                while ($node->attributes->length > 0) {
                    $node->removeAttributeNode($node->attributes->item(0));
                }
                tasko_sanitize_node_children($node, $allowed);
            }
        }
        $node = $next;
    }
}
