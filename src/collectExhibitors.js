'use strict';

const fs = require('fs');
const path = require('path');
const { INDEX_EXHIBITORS, INDEX_PRODUCTS } = require('./algoliaClient');
const { collectAllFromIndex } = require('./collectEngine');
const { mapExhibitor } = require('./mapExhibitor');
const { mapProduct } = require('./mapProduct');
const { parseFilterUrl } = require('./parseFilterUrl');

async function collectExhibitors(filterUrl, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const extraParams = { facetFilters: [], query: '' };

  if (filterUrl) {
    const parsed = parseFilterUrl(filterUrl);
    extraParams.facetFilters = parsed.facetFilters;
    extraParams.query = parsed.query;

    console.log(`Filtro extraído da URL:`);
    console.log(`  query: "${parsed.query}"`);
    console.log(`  facetFilters: ${JSON.stringify(parsed.facetFilters)}`);
    for (const w of parsed.warnings) console.log(`  Aviso: ${w}`);
    console.log('');
  }

  // ---- 1) Expositores ----------------------------------------------------
  console.log('=== Coletando expositores ===');
  const byId = new Map();
  let loggedSampleExhibitor = false;

  const exhibitorsResult = await collectAllFromIndex(
    INDEX_EXHIBITORS,
    extraParams,
    (rawHit) => {
      if (!loggedSampleExhibitor) {
        console.log('\n--- Exemplo de registro BRUTO recebido da API (expositor) ---');
        console.log(JSON.stringify(rawHit, null, 2));
        console.log('--- fim do exemplo ---\n');
        loggedSampleExhibitor = true;
      }
      const mapped = mapExhibitor(rawHit);
      if (mapped.id) byId.set(mapped.id, mapped);
    },
    (p) => onProgress({ phase: 'expositores', collected: p.fetched, total: p.total })
  );

  console.log(`\nExpositores coletados: ${byId.size} / ${exhibitorsResult.totalExpected}`);
  for (const w of exhibitorsResult.warnings) console.log(`  Aviso: ${w}`);

  // ---- 2) Produtos --------------------------------------------------------
  console.log('\n=== Coletando produtos ===');
  let loggedSampleProduct = false;
  let productsLinked = 0;
  let productsOrphan = 0;

  const productsResult = await collectAllFromIndex(
    INDEX_PRODUCTS,
    extraParams,
    (rawHit) => {
      if (!loggedSampleProduct) {
        console.log('\n--- Exemplo de registro BRUTO recebido da API (produto) ---');
        console.log(JSON.stringify(rawHit, null, 2));
        console.log('--- fim do exemplo ---\n');
        loggedSampleProduct = true;
      }
      const product = mapProduct(rawHit);
      const exhibitor = product.exhibitorId ? byId.get(product.exhibitorId) : null;
      if (exhibitor) {
        exhibitor.products.push(product);
        productsLinked += 1;
      } else {
        productsOrphan += 1;
      }
    },
    (p) => onProgress({ phase: 'produtos', collected: p.fetched, total: p.total })
  );

  console.log(`\nProdutos coletados: ${productsResult.totalFetched} / ${productsResult.totalExpected}`);
  console.log(`  Vinculados a algum expositor coletado: ${productsLinked}`);
  if (productsOrphan) {
    console.log(
      `  Sem expositor correspondente na coleta atual: ${productsOrphan} ` +
        `(normal quando um filtro é aplicado só do lado dos expositores, ou o expositor do produto não está nesta coleta)`
    );
  }
  for (const w of productsResult.warnings) console.log(`  Aviso: ${w}`);

  const totalExpected = exhibitorsResult.totalExpected;
  const collectedCount = byId.size;

  console.log(`\n=== Resumo ===`);
  console.log(`  Expositores: ${collectedCount}/${totalExpected}`);
  const diff = totalExpected - collectedCount;
  if (diff === 0) {
    console.log('  ✔ Cobertura completa de expositores.');
  } else {
    console.log(`  ⚠ Faltaram ${diff} expositor(es).`);
  }

  return { exhibitors: Array.from(byId.values()), totalExpected, collectedCount };
}

// Usamos ";" como separador de colunas (não ","), porque é o separador padrão
// que o Excel em português (Brasil) espera ao abrir um CSV com duplo clique
// (no pt-BR a vírgula é o separador decimal). Assim os produtos podem usar
// vírgula normalmente dentro da mesma célula, sem conflitar com as colunas.
const CSV_DELIMITER = ';';

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(CSV_DELIMITER) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatProductsForCsv(products) {
  if (!products || products.length === 0) return '';
  return products.map((p) => `${p.name}${p.url ? ` (${p.url})` : ''}`).join(', ');
}

const SOCIAL_NETWORK_LABELS = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter/X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
};

function formatSocialMediaForCsv(socialMedia) {
  const sm = socialMedia || {};
  return Object.entries(SOCIAL_NETWORK_LABELS)
    .filter(([key]) => sm[key])
    .map(([key, label]) => `${label} (${sm[key]})`)
    .join(', ');
}

function formatSecondaryActivities(ex) {
  return (ex.activityFields || []).filter((f) => f !== ex.mainActivityField).join(', ');
}

function formatRestOfAddress(ex) {
  return [ex.address_1, ex.address_2, ex.address_3, ex.city, ex.zipcode, ex.state].filter(Boolean).join(', ');
}

// Grava em um arquivo temporário e só então renomeia (rename é atômico no mesmo
// filesystem). Assim, quem estiver lendo data/exhibitors.json pelo navegador nunca
// vê um arquivo pela metade enquanto uma atualização está em andamento.
function writeFileAtomic(finalPath, content) {
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, finalPath);
}

function writeOutputs(exhibitors, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'exhibitors.json');
  writeFileAtomic(jsonPath, JSON.stringify(exhibitors, null, 2));

  const columns = [
    { key: 'name', header: 'Nome' },
    { key: 'stand', header: 'Stand' },
    { key: 'country', header: 'País' },
    { key: 'products', header: 'Produtos' },
    { key: 'website', header: 'Site' },
    { key: 'socialMedia', header: 'Redes sociais' },
    { key: 'mainActivityField', header: 'Atividade principal' },
    { key: 'secondaryActivities', header: 'Atividade secundária' },
    { key: 'restOfAddress', header: 'Endereço' },
  ];

  const rows = exhibitors.map((ex) => ({
    ...ex,
    products: formatProductsForCsv(ex.products),
    socialMedia: formatSocialMediaForCsv(ex.socialMedia),
    secondaryActivities: formatSecondaryActivities(ex),
    restOfAddress: formatRestOfAddress(ex),
  }));

  const csvLines = [columns.map((c) => c.header).join(CSV_DELIMITER)];
  for (const row of rows) {
    csvLines.push(columns.map((c) => toCsvValue(row[c.key])).join(CSV_DELIMITER));
  }
  const csvPath = path.join(outDir, 'exhibitors.csv');
  writeFileAtomic(csvPath, '\uFEFF' + csvLines.join('\n'));

  return { jsonPath, csvPath };
}

async function main() {
  const filterUrl = process.argv[2];
  const startedAt = Date.now();
  const { exhibitors, totalExpected, collectedCount } = await collectExhibitors(filterUrl);

  const outDir = path.join(__dirname, '..', 'data');
  const { jsonPath, csvPath } = writeOutputs(exhibitors, outDir);

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nArquivos gerados:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${csvPath}`);
  console.log(`\nTempo total: ${elapsedSec}s`);

  if (collectedCount !== totalExpected) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nErro fatal durante a coleta:', err);
    process.exitCode = 1;
  });
}

module.exports = { collectExhibitors, writeOutputs };
