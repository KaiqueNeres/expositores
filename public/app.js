(function () {
  const PAGE_SIZE = 50;

  // Grupo "Alimentos e Produtos": une as categorias de Activity Field que são
  // efetivamente produtos alimentícios, deixando de fora categorias que não são
  // produto (ex.: Business Hub, Equipment/Technologies/Services, Organizations,
  // Services and trade press, Wines & spirits).
  const FOOD_CATEGORIES = [
    'Confectionery, biscuits and pastry',
    'Cured and salted meat',
    'Dairy products, eggs',
    'Delicatessen, Ready to Eat',
    'Frozen products',
    'Fruits and vegetables',
    'Grocery products',
    'Healthy foods and diet products',
    'Horticulture',
    'Meat and tripe',
    'Non-alcoholic beverages',
    'Other alcoholic beverages',
    'Pet foods',
    'Poultry and game',
    'Seafood products',
    'Semi-finished food products and ingredients',
  ];

  const state = {
    all: [],
    filtered: [],
    page: 1,
  };

  const el = {
    tbody: document.getElementById('table-body'),
    search: document.getElementById('search'),
    countryFilter: document.getElementById('country-filter'),
    activityFilter: document.getElementById('activity-filter'),
    pagination: document.getElementById('pagination'),
    statTotal: document.getElementById('stat-total'),
    statFiltered: document.getElementById('stat-filtered'),
    statPaises: document.getElementById('stat-paises'),
    statComProdutos: document.getElementById('stat-com-produtos'),
    refreshBtn: document.getElementById('refresh-btn'),
    refreshLabel: document.getElementById('refresh-label'),
    refreshStatus: document.getElementById('refresh-status'),
    lastUpdated: document.getElementById('last-updated'),
    statusDot: document.getElementById('status-dot'),
    themeToggle: document.getElementById('theme-toggle'),
  };

  // ---- Tema claro/escuro ----------------------------------------------------
  const THEME_KEY = 'theme';

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
    el.themeToggle.title = theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage indisponível (ex.: modo privado) — o tema só não persiste entre visitas
    }
    applyTheme(next);
  }

  // Envolvido em try/catch para não travar o resto da página (busca, tabela,
  // etc.) caso o HTML carregado esteja de alguma forma desatualizado/diferente
  // do que este script espera (ex.: cache do navegador com uma versão antiga).
  try {
    applyTheme(document.documentElement.getAttribute('data-theme') || getPreferredTheme());
    el.themeToggle.addEventListener('click', toggleTheme);
  } catch (err) {
    console.error('Falha ao inicializar o tema (a página continua funcionando normalmente):', err);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cell(value) {
    if (!value) return '<span class="empty-value">—</span>';
    return escapeHtml(value);
  }

  function buildAddress(ex) {
    const parts = [ex.address_1, ex.address_2, ex.address_3, ex.zipcode, ex.city, ex.state].filter(Boolean);
    return parts.join(', ');
  }

  const SOCIAL_LABELS = {
    linkedin: 'in',
    facebook: 'fb',
    instagram: 'ig',
    twitter: 'x',
    tiktok: 'tt',
    youtube: 'yt',
    pinterest: 'pin',
  };

  function buildSocialLinks(socialMedia) {
    if (!socialMedia) return '<span class="empty-value">—</span>';
    const links = Object.entries(SOCIAL_LABELS)
      .filter(([key]) => socialMedia[key])
      .map(
        ([key, label]) =>
          `<a class="social-chip" href="${escapeHtml(socialMedia[key])}" target="_blank" rel="noopener" title="${key}">${label}</a>`
      );
    return links.length ? links.join(' ') : '<span class="empty-value">—</span>';
  }

  function buildProductsCell(products) {
    if (!products || products.length === 0) return '<span class="empty-value">—</span>';
    const items = products
      .map((p) => {
        const label = p.url
          ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`
          : escapeHtml(p.name);
        return `<li>${label}</li>`;
      })
      .join('');
    return `<details><summary>${products.length} produto${products.length > 1 ? 's' : ''}</summary><ul class="product-list">${items}</ul></details>`;
  }

  function render() {
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

    if (pageItems.length === 0) {
      el.tbody.innerHTML = '<tr><td colspan="9" class="no-data">Nenhum expositor encontrado.</td></tr>';
    } else {
      el.tbody.innerHTML = pageItems
        .map((ex) => {
          const address = buildAddress(ex);
          const site = ex.website
            ? `<a class="site-link" href="${escapeHtml(ex.website)}" target="_blank" rel="noopener">${escapeHtml(ex.website)}</a>`
            : '<span class="empty-value">—</span>';
          return `<tr>
            <td>${cell(ex.name)}</td>
            <td>${cell(ex.stand)}</td>
            <td>${address ? escapeHtml(address) : '<span class="empty-value">—</span>'}</td>
            <td>${cell(ex.city)}</td>
            <td>${cell(ex.country)}</td>
            <td>${cell(ex.mainActivityField)}</td>
            <td>${site}</td>
            <td>${buildSocialLinks(ex.socialMedia)}</td>
            <td>${buildProductsCell(ex.products)}</td>
          </tr>`;
        })
        .join('');
    }

    renderPagination();
    el.statFiltered.textContent = state.filtered.length.toLocaleString('pt-BR');
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;

    el.pagination.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '← Anterior';
    prevBtn.disabled = state.page <= 1;
    prevBtn.onclick = () => { state.page -= 1; render(); };

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Próxima →';
    nextBtn.disabled = state.page >= totalPages;
    nextBtn.onclick = () => { state.page += 1; render(); };

    const info = document.createElement('span');
    info.textContent = `Página ${state.page} de ${totalPages}`;

    el.pagination.append(prevBtn, info, nextBtn);
  }

  function applyFilters() {
    const term = el.search.value.trim().toLowerCase();
    const country = el.countryFilter.value;
    const activity = el.activityFilter.value;

    state.filtered = state.all.filter((ex) => {
      if (country && ex.country !== country) return false;
      if (activity === 'food' && !(ex.activityFields || []).some((f) => FOOD_CATEGORIES.includes(f))) return false;
      if (!term) return true;
      const productNames = (ex.products || []).map((p) => p.name);
      const haystack = [ex.name, ex.city, ex.stand, ex.country, ex.website, ...productNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

    state.page = 1;
    render();
  }

  function populateCountryFilter(exhibitors) {
    const previous = el.countryFilter.value;
    el.countryFilter.innerHTML = '<option value="">Todos os países</option>';
    const countries = Array.from(new Set(exhibitors.map((e) => e.country).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    for (const c of countries) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      el.countryFilter.appendChild(opt);
    }
    if (countries.includes(previous)) el.countryFilter.value = previous;
    el.statPaises.textContent = countries.length;
  }

  // ";" como separador de coluna (padrão do Excel em pt-BR); os produtos usam
  // vírgula dentro da mesma célula, sem conflitar com as colunas.
  const CSV_DELIMITER = ';';

  const CSV_COLUMNS = [
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

  const SOCIAL_NETWORK_LABELS_CSV = {
    linkedin: 'LinkedIn',
    facebook: 'Facebook',
    instagram: 'Instagram',
    twitter: 'Twitter/X',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    pinterest: 'Pinterest',
  };

  function toCsvValue(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(CSV_DELIMITER) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function formatSocialMediaForCsv(socialMedia) {
    const sm = socialMedia || {};
    return Object.entries(SOCIAL_NETWORK_LABELS_CSV)
      .filter(([key]) => sm[key])
      .map(([key, label]) => `${label} (${sm[key]})`)
      .join(', ');
  }

  function buildCsvRow(ex) {
    const row = {
      ...ex,
      products: (ex.products || []).map((p) => `${p.name}${p.url ? ` (${p.url})` : ''}`).join(', '),
      socialMedia: formatSocialMediaForCsv(ex.socialMedia),
      secondaryActivities: (ex.activityFields || []).filter((f) => f !== ex.mainActivityField).join(', '),
      restOfAddress: [ex.address_1, ex.address_2, ex.address_3, ex.city, ex.zipcode, ex.state].filter(Boolean).join(', '),
    };
    return CSV_COLUMNS.map((c) => toCsvValue(row[c.key])).join(CSV_DELIMITER);
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadFilteredCsv() {
    const lines = [CSV_COLUMNS.map((c) => c.header).join(CSV_DELIMITER), ...state.filtered.map(buildCsvRow)];
    downloadBlob('\uFEFF' + lines.join('\n'), 'expositores-filtrado.csv', 'text/csv;charset=utf-8');
  }

  function downloadFilteredJson() {
    downloadBlob(JSON.stringify(state.filtered, null, 2), 'expositores-filtrado.json', 'application/json;charset=utf-8');
  }

  // ---- Consumo local + botão "Atualizar dados" -----------------------------
  // A página sempre lê os arquivos já salvos em data/. A coleta só roda quando
  // o usuário clica em "Atualizar dados" (ou quando o servidor detecta que
  // ainda não existe nenhum dado local) e só substitui o que já existe se
  // terminar com sucesso — enquanto isso, a tela continua mostrando os dados
  // antigos normalmente.
  let pollTimer = null;
  // Fica true quando não existe a API de coleta atrás da página (hospedagem
  // estática): aí não há o que o botão "Atualizar dados" possa chamar.
  let staticMode = false;

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '—';
    }
  }

  function setRefreshingUI(isRefreshing) {
    el.refreshBtn.disabled = isRefreshing;
    el.refreshBtn.classList.toggle('is-loading', isRefreshing);
    el.refreshLabel.textContent = isRefreshing ? 'Atualizando...' : 'Atualizar dados';
  }

  function renderStatus(status) {
    el.lastUpdated.textContent = `Última atualização: ${formatDateTime(status.lastUpdated)}`;
    setRefreshingUI(status.refreshing);

    el.statusDot.classList.remove('is-refreshing', 'is-error');
    if (status.refreshing) {
      el.statusDot.classList.add('is-refreshing');
    } else if (status.lastError) {
      el.statusDot.classList.add('is-error');
    }

    if (status.refreshing) {
      const p = status.progress;
      el.refreshStatus.textContent = p
        ? `Coletando ${p.phase}${p.total ? `: ${p.collected.toLocaleString('pt-BR')}/${p.total.toLocaleString('pt-BR')}` : '...'}`
        : 'Atualizando...';
    } else if (status.lastError) {
      el.refreshStatus.textContent = `Falha na última atualização: ${status.lastError}`;
    } else {
      el.refreshStatus.textContent = '';
    }
  }

  // URLs relativas de propósito: a página funciona igual servida pelo Node
  // (raiz do site) ou por uma hospedagem estática apontando para public/,
  // inclusive quando ela fica dentro de um subcaminho (ex.: /expositores/).
  async function fetchStatus() {
    const res = await fetch('api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error('status indisponível');
    return res.json();
  }

  async function reloadData() {
    const res = await fetch('data/exhibitors.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Não foi possível carregar data/exhibitors.json');
    if (staticMode) {
      const modified = res.headers.get('Last-Modified');
      el.lastUpdated.textContent = `Última atualização: ${modified ? formatDateTime(modified) : '—'}`;
    }
    const data = await res.json();
    state.all = data;
    el.statTotal.textContent = data.length.toLocaleString('pt-BR');
    el.statComProdutos.textContent = data
      .filter((e) => e.products && e.products.length > 0)
      .length.toLocaleString('pt-BR');
    populateCountryFilter(data);
    applyFilters();
  }

  function pollStatus() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        const status = await fetchStatus();
        renderStatus(status);
        if (!status.refreshing) {
          clearInterval(pollTimer);
          pollTimer = null;
          if (!status.lastError) {
            try {
              await reloadData();
            } catch {
              // mantém os dados que já estavam na tela
            }
          }
        }
      } catch {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 1500);
  }

  async function startRefresh() {
    try {
      setRefreshingUI(true);
      el.refreshStatus.textContent = 'Iniciando atualização...';
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (!res.ok && res.status !== 409) throw new Error('Falha ao iniciar atualização');
      pollStatus();
    } catch (err) {
      setRefreshingUI(false);
      el.refreshStatus.textContent = `Erro: ${err.message}`;
    }
  }

  async function init() {
    try {
      const status = await fetchStatus();
      renderStatus(status);
      if (status.refreshing) pollStatus();
    } catch {
      // ambiente sem a API de status (ex.: hospedagem estática) — segue só com os dados locais
      staticMode = true;
      el.refreshBtn.hidden = true;
      el.refreshStatus.textContent = '';
    }

    try {
      await reloadData();
    } catch (err) {
      el.tbody.innerHTML = `<tr><td colspan="9" class="no-data">Nenhum dado local ainda. Clique em "Atualizar dados" para coletar. (${escapeHtml(
        err.message
      )})</td></tr>`;
    }
  }

  // Também protegido: se algum botão/campo não existir por algum motivo (ex.:
  // mistura de cache antigo de HTML com este JS novo), a página ainda carrega
  // os dados em vez de morrer silenciosamente antes de chegar no init().
  try {
    el.search.addEventListener('input', applyFilters);
    el.countryFilter.addEventListener('change', applyFilters);
    el.activityFilter.addEventListener('change', applyFilters);
    el.refreshBtn.addEventListener('click', startRefresh);
    // O botão de JSON hoje está desativado no HTML, então cada um é registrado
    // separadamente: a ausência de um não pode impedir o outro de funcionar.
    document.getElementById('download-json')?.addEventListener('click', downloadFilteredJson);
    document.getElementById('download-csv')?.addEventListener('click', downloadFilteredCsv);
  } catch (err) {
    console.error('Falha ao registrar algum controle da tela (verifique se o cache do navegador está desatualizado):', err);
  }

  init();
})();
