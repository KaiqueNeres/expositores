'use strict';

// Copia data/ para public/data/.
//
// O servidor Node serve /data/ direto da pasta data/, mas uma hospedagem
// estática apontada para public/ (ex.: IIS) só enxerga o que está dentro de
// public/. Roda automaticamente ao final de cada coleta e também pode ser
// chamado à mão com "npm run sync:data".

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'data');
const TARGET = path.join(ROOT, 'public', 'data');

function syncPublicData() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Pasta "${SOURCE}" não existe. Rode "npm run collect" antes.`);
  }
  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.cpSync(SOURCE, TARGET, { recursive: true });
  return fs.readdirSync(TARGET);
}

if (require.main === module) {
  try {
    console.log(`Copiados para public/data/: ${syncPublicData().join(', ')}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { syncPublicData };
