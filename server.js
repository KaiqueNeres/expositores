'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { collectExhibitors, writeOutputs } = require('./src/collectExhibitors');
const { syncPublicData } = require('./src/syncPublicData');

const PORT = process.env.PORT || 3020;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const EXHIBITORS_JSON = path.join(DATA_DIR, 'exhibitors.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// A raiz do site é public/, e /data/ aponta para os arquivos gerados pela
// coleta. Assim a página funciona com caminhos relativos (styles.css, app.js,
// data/exhibitors.json), tanto aqui quanto em uma hospedagem estática que
// aponte direto para a pasta public/ (ex.: IIS).
function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  // Trabalha sempre com barras "/" (padrão de URL), independente do SO,
  // e só então converte para o separador nativo ao juntar com a pasta base.
  const posixNormalized = decoded.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const segments = posixNormalized.split('/').filter(Boolean);
  if (segments.includes('..')) return null;
  if (segments.length === 0) return path.join(PUBLIC_DIR, 'index.html');

  const isData = segments[0] === 'data';
  const baseDir = isData ? DATA_DIR : PUBLIC_DIR;
  const fullPath = path.join(baseDir, ...(isData ? segments.slice(1) : segments));
  if (!fullPath.startsWith(baseDir)) return null;
  return fullPath;
}

// ---- Estado da atualização de dados ----------------------------------------
// A página sempre consome os arquivos locais em data/. A coleta só é disparada
// quando alguém aperta "Atualizar dados" (ou quando não existe nenhum dado
// local ainda) — e só substitui os arquivos existentes se terminar com sucesso.
const refreshState = {
  refreshing: false,
  progress: null, // { phase: 'expositores'|'produtos', collected, total }
  lastUpdated: null, // ISO string
  lastError: null,
  lastResult: null, // { collectedCount, totalExpected, elapsedSec }
};

function readLastUpdated() {
  try {
    return fs.statSync(EXHIBITORS_JSON).mtime.toISOString();
  } catch {
    return null;
  }
}
refreshState.lastUpdated = readLastUpdated();

async function runRefresh(filterUrl) {
  if (refreshState.refreshing) return false;

  refreshState.refreshing = true;
  refreshState.lastError = null;
  refreshState.progress = { phase: 'expositores', collected: 0, total: null };

  const startedAt = Date.now();
  console.log('\n[refresh] Iniciando atualização dos dados...');
  try {
    const { exhibitors, totalExpected, collectedCount } = await collectExhibitors(filterUrl, {
      onProgress: (p) => {
        refreshState.progress = p;
      },
    });

    // Só substitui os arquivos locais se a coleta chegou até aqui sem lançar erro.
    writeOutputs(exhibitors, DATA_DIR);

    // Mantém public/data/ em dia: quando o IIS (ou outra hospedagem estática)
    // serve os arquivos, é de lá que a página lê os dados. Uma falha aqui não
    // invalida a coleta — os dados em data/ já estão gravados.
    try {
      syncPublicData();
    } catch (err) {
      console.warn('[refresh] Não foi possível atualizar public/data/:', err.message);
    }

    refreshState.lastUpdated = new Date().toISOString();
    refreshState.lastResult = {
      collectedCount,
      totalExpected,
      elapsedSec: ((Date.now() - startedAt) / 1000).toFixed(1),
    };
    console.log(
      `[refresh] Concluído: ${collectedCount}/${totalExpected} expositores em ${refreshState.lastResult.elapsedSec}s.`
    );
  } catch (err) {
    console.error('[refresh] Erro durante a atualização:', err);
    refreshState.lastError = (err && err.message) || String(err);
  } finally {
    refreshState.refreshing = false;
    refreshState.progress = null;
  }
  return true;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // ---- API ------------------------------------------------------------
  if (urlPath === '/api/status' && req.method === 'GET') {
    sendJson(res, 200, refreshState);
    return;
  }

  if (urlPath === '/api/refresh' && req.method === 'POST') {
    if (refreshState.refreshing) {
      sendJson(res, 409, { error: 'Já existe uma atualização em andamento.', ...refreshState });
      return;
    }

    readRequestBody(req).then((body) => {
      let filterUrl;
      try {
        const parsed = body ? JSON.parse(body) : {};
        filterUrl = parsed.filterUrl || undefined;
      } catch {
        // corpo inválido/vazio: ignora e coleta tudo
      }

      // Dispara em segundo plano; a resposta não espera terminar.
      runRefresh(filterUrl).catch((err) => console.error('[refresh] Erro inesperado:', err));
      sendJson(res, 202, { started: true, ...refreshState });
    });
    return;
  }

  // ---- Arquivos estáticos ----------------------------------------------
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Método não permitido');
    return;
  }

  const fullPath = resolveSafePath(req.url);
  if (!fullPath) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado. Clique em "Atualizar dados" na página, ou rode "npm run collect".');
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      // Ferramenta local em desenvolvimento ativo: preferimos sempre buscar a
      // versão mais nova em vez de correr o risco do navegador guardar em cache
      // um HTML/JS antigo (o que pode deixar a página com uma mistura de versões
      // e o script quebrando silenciosamente, sem mostrar nada na tela).
      'Cache-Control': 'no-store',
    });
    res.end(content);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nJá existe algo rodando na porta ${PORT} (provavelmente outra instância deste servidor).\n` +
        `Encerre o processo anterior antes de rodar "npm start" de novo, ou defina outra porta:\n` +
        `  PowerShell:  $env:PORT=3001; npm start\n`
    );
    process.exit(1);
  }
  console.error('\nErro ao iniciar o servidor:', err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  if (!refreshState.lastUpdated) {
    console.log('Nenhum dado local encontrado em data/. Iniciando coleta inicial automaticamente...');
    runRefresh().catch((err) => console.error('[refresh] Erro na coleta inicial:', err));
  }
});

module.exports = server;
