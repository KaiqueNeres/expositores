'use strict';

/**
 * Cliente HTTP para a API pública de busca da Algolia usada pelo site da SIAL Paris.
 *
 * A chave usada aqui é a "search-only API key" pública que o próprio site expõe
 * no navegador de qualquer visitante (não é uma credencial secreta/administrativa).
 */

const APP_ID = 'W1BGHM6UJN';
const API_KEY = 'deb06c31b0495c80bcbdf0077536d647';

const INDEX_EXHIBITORS = 'catalog.prod.sial.exhibitors.en';
const INDEX_PRODUCTS = 'catalog.prod.sial.products.en';

function queryUrl(indexName) {
  return `https://${APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma query em um índice da Algolia, com retry automático em caso de
 * falha de rede ou erro temporário (ex.: rate limit).
 *
 * @param {string} indexName Nome do índice (ex.: INDEX_EXHIBITORS ou INDEX_PRODUCTS)
 * @param {object} body Corpo da requisição (query, filters, hitsPerPage, offset, length, facets, etc.)
 * @param {object} [opts]
 * @param {number} [opts.retries=4] Número máximo de tentativas extras
 * @param {number} [opts.timeoutMs=15000] Timeout por tentativa
 */
async function algoliaQuery(indexName, body, opts = {}) {
  const { retries = 4, timeoutMs = 15000 } = opts;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(queryUrl(indexName), {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': APP_ID,
          'X-Algolia-API-Key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} (temporário) - tentando novamente`);
      }

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return JSON.parse(text);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        const backoffMs = 500 * Math.pow(2, attempt);
        await sleep(backoffMs);
        continue;
      }
    }
  }
  throw new Error(`Falha ao consultar Algolia após ${retries + 1} tentativas: ${lastError.message}`);
}

module.exports = { algoliaQuery, APP_ID, INDEX_EXHIBITORS, INDEX_PRODUCTS, INDEX_NAME: INDEX_EXHIBITORS };
