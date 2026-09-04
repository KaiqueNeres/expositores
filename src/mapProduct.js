'use strict';

/**
 * Converte um "hit" bruto da Algolia (índice de produtos) no formato final.
 * Cada produto traz `exhibitor.id`, que usamos para agrupá-lo dentro do
 * expositor correspondente.
 */
function stripHtml(html) {
  if (!html) return null;
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function mapProduct(hit) {
  return {
    id: hit.objectID || hit.id || null,
    exhibitorId: (hit.exhibitor && hit.exhibitor.id) || null,
    name: hit.name ?? null,
    brand: (hit.brand && hit.brand.name) || null,
    url: hit.url ?? null,
    madeIn: hit.madeIn ?? null,
    description: stripHtml(hit.description),
    image: (hit.logoLink && (hit.logoLink.default || hit.logoLink.thumbnail)) || null,
  };
}

module.exports = { mapProduct };
