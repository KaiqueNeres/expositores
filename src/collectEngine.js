'use strict';

const { algoliaQuery } = require('./algoliaClient');

// A API da Algolia desses índices está configurada com "distinct = 4", então o
// máximo de hitsPerPage permitido é 1000 / 4 = 250 por requisição.
const PAGE_SIZE = 250;

// A busca "normal" (com ranking/distinct) desses índices só consegue paginar até
// ~2000 resultados por consulta, mesmo que existam mais registros no total
// (é uma limitação de configuração do índice, não um bug do nosso código).
// Por isso, sempre que uma fatia tiver mais que esse limite de registros,
// nós a dividimos ao meio (bisseção) até cada fatia ficar pequena o
// suficiente para paginar com segurança.
const SAFE_BUCKET_LIMIT = 1800;

// Todo registro nesses índices tem um campo numérico `_createUTCTimestamp`
// (timestamp Unix de criação), sem exceções — diferente de outros campos que
// podem vir nulos. Usamos esse campo para fatiar o índice inteiro em faixas
// de tempo, garantindo cobertura total.
const TIMESTAMP_FIELD = '_createUTCTimestamp';

const DELAY_BETWEEN_REQUESTS_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rangeFilter(lo, hi) {
  // Faixa meio-aberta [lo, hi) para nunca contar o mesmo registro em duas faixas.
  return `${TIMESTAMP_FIELD} >= ${lo} AND ${TIMESTAMP_FIELD} < ${hi}`;
}

/**
 * Coleta TODOS os registros de um índice da Algolia, contornando o limite de
 * paginação através de bisseção recursiva por faixas de `_createUTCTimestamp`.
 *
 * @param {string} indexName Nome do índice na Algolia
 * @param {object} [extraParams]
 * @param {string} [extraParams.query] Texto de busca livre
 * @param {string[][]} [extraParams.facetFilters] Filtros no formato facetFilters da Algolia
 * @param {(hit: object) => void} onHit Chamado para cada hit bruto encontrado
 * @returns {Promise<{ totalExpected: number, totalFetched: number, leaves: number, warnings: string[] }>}
 */
async function collectAllFromIndex(indexName, extraParams, onHit) {
  const params = extraParams || { facetFilters: [], query: '' };
  const stats = { leaves: 0, totalFetched: 0, warnings: [] };

  const baseBody = {
    query: params.query || '',
    ...(params.facetFilters && params.facetFilters.length ? { facetFilters: params.facetFilters } : {}),
  };

  const totalInfo = await algoliaQuery(indexName, { ...baseBody, hitsPerPage: 0 });
  const totalExpected = totalInfo.nbHits;

  const now = Math.floor(Date.now() / 1000);
  const upperBound = now + 86400; // +1 dia de margem de segurança
  const lowerBound = 0;

  async function countInRange(lo, hi) {
    const data = await algoliaQuery(indexName, { ...baseBody, hitsPerPage: 0, filters: rangeFilter(lo, hi) });
    return data.nbHits;
  }

  async function fetchAllInRange(lo, hi, expectedCount) {
    let offset = 0;
    let fetched = 0;
    while (true) {
      const data = await algoliaQuery(indexName, {
        ...baseBody,
        filters: rangeFilter(lo, hi),
        offset,
        length: PAGE_SIZE,
      });
      const hits = data.hits || [];
      for (const hit of hits) onHit(hit);
      fetched += hits.length;
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
      if (hits.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      if (fetched >= expectedCount + PAGE_SIZE) break; // guarda de segurança
    }
    return fetched;
  }

  async function collectRange(lo, hi, depth) {
    if (lo >= hi) return;

    const count = await countInRange(lo, hi);
    await sleep(DELAY_BETWEEN_REQUESTS_MS);

    if (count === 0) return;

    const width = hi - lo;
    if (count > SAFE_BUCKET_LIMIT && width > 1 && depth < 40) {
      const mid = lo + Math.floor(width / 2);
      await collectRange(lo, mid, depth + 1);
      await collectRange(mid, hi, depth + 1);
      return;
    }

    if (count > SAFE_BUCKET_LIMIT) {
      stats.warnings.push(
        `Faixa [${lo}, ${hi}) não pôde ser subdividida (largura mínima atingida) e tem ${count} registros; ` +
          `só é possível recuperar os primeiros ~2000 dessa faixa.`
      );
    }

    console.log(`  [${indexName}] Faixa [${lo}, ${hi}) -> ${count} registro(s), coletando...`);
    const fetched = await fetchAllInRange(lo, hi, count);
    stats.leaves += 1;
    stats.totalFetched += fetched;
  }

  await collectRange(lowerBound, upperBound, 0);

  return { totalExpected, totalFetched: stats.totalFetched, leaves: stats.leaves, warnings: stats.warnings };
}

module.exports = { collectAllFromIndex };
