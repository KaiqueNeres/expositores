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
  };

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
    const countries = Array.from(new Set(exhibitors.map((e) => e.country).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    for (const c of countries) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      el.countryFilter.appendChild(opt);
    }
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

  async function init() {
    try {
      const res = await fetch('/data/exhibitors.json');
      if (!res.ok) throw new Error('Não foi possível carregar data/exhibitors.json');
      const data = await res.json();
      state.all = data;
      el.statTotal.textContent = data.length.toLocaleString('pt-BR');
      el.statComProdutos.textContent = data.filter((e) => e.products && e.products.length > 0).length.toLocaleString('pt-BR');
      populateCountryFilter(data);
      applyFilters();
    } catch (err) {
      el.tbody.innerHTML = `<tr><td colspan="9" class="no-data">Erro ao carregar dados: ${escapeHtml(
        err.message
      )}. Rode "npm run collect" primeiro.</td></tr>`;
    }
  }

  el.search.addEventListener('input', applyFilters);
  el.countryFilter.addEventListener('change', applyFilters);
  el.activityFilter.addEventListener('change', applyFilters);
  document.getElementById('download-json').addEventListener('click', downloadFilteredJson);
  document.getElementById('download-csv').addEventListener('click', downloadFilteredCsv);

  init();
})();
