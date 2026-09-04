'use strict';

/**
 * Converte um "hit" bruto da Algolia (índice de expositores) no formato final que salvamos.
 *
 * Campos principais (solicitados): id, name, address_1, address_2, address_3,
 * zipcode, city, state, country.
 *
 * Campos extras: stand(s), site (website) e redes sociais do expositor — todos
 * já disponíveis no mesmo registro, sem custo adicional de requisições.
 *
 * A lista de produtos (`products`) é preenchida depois, em collectExhibitors.js,
 * cruzando com o índice de produtos.
 */
function formatStands(stands) {
  if (!Array.isArray(stands) || stands.length === 0) return null;
  return stands
    .map((s) => {
      const parts = [];
      if (s.hall) parts.push(`Hall ${s.hall}`);
      const aisleNumber = [s.aisle, s.number].filter(Boolean).join('');
      if (aisleNumber) parts.push(aisleNumber);
      return parts.join(' - ') || null;
    })
    .filter(Boolean)
    .join('; ') || null;
}

function formatActivityFields(businessArea) {
  if (!Array.isArray(businessArea) || businessArea.length === 0) return [];
  // Usamos especificamente "categories.lvl0" (não "name") porque um expositor pode
  // estar associado a subcategorias mais específicas (lvl1/lvl2); o filtro "Activity
  // Field" do site sempre se refere ao nível 0 (a lista fixa de ~21 grandes categorias).
  return Array.from(new Set(businessArea.map((b) => b['categories.lvl0']).filter(Boolean)));
}

function mapSocialMedia(urls) {
  const u = urls || {};
  return {
    linkedin: u.linkedin ?? null,
    facebook: u.facebook ?? null,
    instagram: u.instagram ?? null,
    twitter: u.twitter ?? null,
    tiktok: u.tiktok ?? null,
    youtube: u.youtube ?? null,
    pinterest: u.pinterest ?? null,
  };
}

function mapExhibitor(hit) {
  const address = hit.address || {};
  return {
    id: hit.objectID || hit.id || null,
    name: hit.name ?? null,
    address_1: address.address_1 ?? null,
    address_2: address.address_2 ?? null,
    address_3: address.address_3 ?? null,
    zipcode: address.zipcode ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    country: address.country ?? null,
    stand: formatStands(hit.stands),
    website: (hit.urls && hit.urls.website) || null,
    mainActivityField: (hit.mainBusinessArea && hit.mainBusinessArea.labelTranslated) || null,
    activityFields: formatActivityFields(hit.businessArea),
    socialMedia: mapSocialMedia(hit.urls),
    products: [], // preenchido depois com base no índice de produtos
  };
}

module.exports = { mapExhibitor };
