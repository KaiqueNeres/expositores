'use strict';

const qs = require('qs');
const { INDEX_NAME } = require('./algoliaClient');

/**
 * A página de expositores guarda o estado dos filtros (Activity Field,
 * Certification, país, etc.) diretamente na URL, no formato usado pelo
 * widget "Vue InstantSearch" da Algolia. Por exemplo:
 *
 *   ?catalog.prod.sial.exhibitors.en[hierarchicalMenu][businessArea.categories.lvl0][0]=Fruits and vegetables
 *   ?catalog.prod.sial.exhibitors.en[refinementList][certifications.label][0]=AOC / IGP
 *
 * Essa função lê essa URL e devolve o equivalente em `facetFilters` /
 * `query` para usarmos diretamente nas consultas à API da Algolia.
 *
 * @param {string} urlString URL completa copiada da barra de endereço do site
 *   (depois de aplicar os filtros desejados na página de expositores).
 * @returns {{ facetFilters: string[][], query: string, warnings: string[] }}
 */
function parseFilterUrl(urlString) {
  const url = new URL(urlString);
  const parsed = qs.parse(url.search.replace(/^\?/, ''));
  const state = parsed[INDEX_NAME];

  const result = { facetFilters: [], query: '', warnings: [] };

  if (!state) {
    result.warnings.push(
      `Não encontrei nenhum filtro reconhecido na URL (esperava o parâmetro "${INDEX_NAME}[...]"). ` +
        `A coleta será feita sem filtro (todos os expositores).`
    );
    return result;
  }

  for (const [widgetType, attributes] of Object.entries(state)) {
    if (widgetType === 'configure' || widgetType === 'page' || widgetType === 'sortBy') {
      continue; // parâmetros internos de ranking/paginação, não são filtros de dado
    }

    if (widgetType === 'query') {
      result.query = String(attributes);
      continue;
    }

    if (widgetType === 'hierarchicalMenu' || widgetType === 'refinementList') {
      for (const [attribute, values] of Object.entries(attributes)) {
        const list = Array.isArray(values) ? values : [values];
        const orGroup = list.map((v) => `${attribute}:${v}`);
        if (orGroup.length) result.facetFilters.push(orGroup);
      }
      continue;
    }

    if (widgetType === 'menu') {
      for (const [attribute, value] of Object.entries(attributes)) {
        result.facetFilters.push([`${attribute}:${value}`]);
      }
      continue;
    }

    if (widgetType === 'range') {
      for (const [attribute, range] of Object.entries(attributes)) {
        result.warnings.push(
          `Filtro de intervalo ("${attribute}": ${JSON.stringify(range)}) foi ignorado — ` +
            `esse tipo de filtro ainda não é suportado automaticamente.`
        );
      }
      continue;
    }

    result.warnings.push(`Tipo de filtro desconhecido "${widgetType}" foi ignorado.`);
  }

  return result;
}

module.exports = { parseFilterUrl };
