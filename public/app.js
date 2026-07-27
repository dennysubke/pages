const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');
const fileUpload = document.querySelector('#file-upload');
const folderUpload = document.querySelector('#folder-upload');
const zipUpload = document.querySelector('#zip-upload');

const state = {
  authenticated: false,
  loading: true,
  dashboard: null,
  system: null,
  sites: [],
  templates: [],
  templateSearch: '',
  templateCategory: 'All',
  siteFilter: 'all',
  currentSite: null,
  currentTab: 'overview',
  files: [],
  currentFile: null,
  editorContent: '',
  backups: [],
  search: '',
  sidebarOpen: false,
  modal: null,
  busy: null,
  theme: localStorage.getItem('pages-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
};

document.documentElement.dataset.theme = state.theme;

const icons = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  templates: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2l1.5-1.5-3-3Z"/><path d="m9 18-3-3c1.7-4.6 5-8.8 10-11 1.5-.7 3.5-1.3 5.5-1.5-.2 2-.8 4-1.5 5.5-2.2 5-6.4 8.3-11 10Z"/><circle cx="15" cy="9" r="2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/>',
  publish: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 15v5h14v-5"/>',
  draft: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 15h8M8 11h4"/>',
  server: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
  pages: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
  settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.38.36.72.65 1 .29.28.68.43 1.08.4H21a2 2 0 0 1 0 4h-.09c-.4-.03-.79.12-1.08.4-.29.28-.51.62-.65 1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  harddrive: '<path d="M4 4h16v16H4z"/><path d="M4 15h16M8 18h.01M12 18h.01"/>',
  archive: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="m15 18-6-6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 19h16"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
  folder: '<path d="M3 5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  folderPlus: '<path d="M3 5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 11v6M9 14h6"/>',
  filePlus: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 12v6M9 15h6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  code: '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  lightning: '<path d="m13 2-9 12h8l-1 8 9-12h-8Z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  tor: '<path d="M12 2c2.2 2.5 3.3 4.9 3.3 7.1A3.3 3.3 0 0 1 12 12.4 3.3 3.3 0 0 1 8.7 9.1C8.7 6.9 9.8 4.5 12 2Z"/><path d="M12 12.4c3.2 0 5.8 2.2 5.8 4.9 0 2.6-2.6 4.7-5.8 4.7s-5.8-2.1-5.8-4.7c0-2.7 2.6-4.9 5.8-4.9Z"/><path d="M12 2v20"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14h1"/>',
  wifi: '<path d="M5 12.6a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>'
};

function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatNumber(value = 0) {
  return new Intl.NumberFormat().format(value);
}

function relativeTime(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60_000) return 'Just now';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 2_592_000_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return date.toLocaleDateString();
}

function joinUrl(origin, pathname = '/') {
  if (!origin) return '';
  return `${origin.replace(/\/$/, '')}/${String(pathname).replace(/^\//, '')}`;
}

function accessInfo() {
  return state.system?.access || {};
}

function siteUrls(site) {
  const access = accessInfo();
  const fallbackOrigin = access.current_origin || location.origin;
  const localOrigin = access.local_origin || (!location.hostname.endsWith('.onion') ? fallbackOrigin : '');
  const local = localOrigin ? joinUrl(localOrigin, site.public_path) : '';
  const onion = access.onion_origin ? joinUrl(access.onion_origin, site.public_path) : '';
  const independent = site.independent_onion?.hostname ? `http://${site.independent_onion.hostname}/` : '';
  const custom = (site.domains || []).map(hostname => `https://${hostname}/`);
  const preferred = independent && location.hostname === site.independent_onion.hostname ? independent : access.current_is_onion && onion ? onion : local || joinUrl(fallbackOrigin, site.public_path);
  return { local, onion, independent, custom, preferred };
}

async function copyText(value) {
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else throw new Error('Clipboard API unavailable');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  toast('Address copied');
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.json);
  }
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    state.authenticated = false;
    render();
    throw new Error('Your session has expired');
  }
  const type = response.headers.get('content-type') || '';
  const result = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(result?.error || result || `Request failed (${response.status})`);
  return result;
}

function toast(message, type = 'success') {
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span>`;
  toastRoot.append(element);
  setTimeout(() => element.remove(), 3800);
}

function setBusy(title, text = 'Please keep this window open.') {
  state.busy = { title, text };
  renderOverlay();
}
function clearBusy() {
  state.busy = null;
  document.querySelector('.progress-overlay')?.remove();
}
function renderOverlay() {
  document.querySelector('.progress-overlay')?.remove();
  if (!state.busy) return;
  const overlay = document.createElement('div');
  overlay.className = 'progress-overlay';
  overlay.innerHTML = `<div class="progress-card"><strong>${escapeHtml(state.busy.title)}</strong><p>${escapeHtml(state.busy.text)}</p><div class="progress-track"><div class="progress-bar"></div></div></div>`;
  document.body.append(overlay);
}

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const parts = hash.split('/');
  if (parts[0] === 'site' && parts[1]) return { view: 'site', id: Number(parts[1]), tab: parts[2] || 'overview' };
  if (parts[0] === 'sites') return { view: 'sites' };
  if (parts[0] === 'templates') return { view: 'templates' };
  if (parts[0] === 'settings') return { view: 'settings' };
  return { view: 'dashboard' };
}

function navigate(path) {
  location.hash = path;
}

async function loadBase() {
  const [dashboard, sites, system, templates] = await Promise.all([api('/api/dashboard'), api('/api/sites'), api('/api/system'), api('/api/templates')]);
  state.dashboard = dashboard;
  state.sites = sites;
  state.system = system;
  state.templates = templates;
}

async function loadSite(id, tab = 'overview') {
  state.currentSite = await api(`/api/sites/${id}`);
  state.currentTab = tab;
  if (tab === 'files') {
    state.files = await api(`/api/sites/${id}/files`);
    state.currentFile = null;
    state.editorContent = '';
  }
  if (tab === 'backups') state.backups = await api(`/api/sites/${id}/backups`);
}

async function syncRoute() {
  if (!state.authenticated) return;
  const route = currentRoute();
  try {
    if (!state.dashboard) await loadBase();
    if (route.view === 'site') await loadSite(route.id, route.tab);
  } catch (error) {
    toast(error.message, 'error');
    if (route.view === 'site') navigate('sites');
  }
  render();
}

function shell(content, active = 'dashboard') {
  const searchTemplates = active === 'templates';
  const searchValue = searchTemplates ? state.templateSearch : state.search;
  const searchPlaceholder = searchTemplates ? 'Search templates' : 'Search websites';
  return `<div class="app-shell">
    <aside class="sidebar ${state.sidebarOpen ? 'open' : ''}">
      <div class="brand"><img src="/admin/logo.svg" alt=""><span>Pages</span></div>
      <nav class="nav">
        <button class="nav-button ${active === 'dashboard' ? 'active' : ''}" data-nav="dashboard">${icon('dashboard')}<span>Overview</span></button>
        <button class="nav-button ${active === 'sites' ? 'active' : ''}" data-nav="sites">${icon('pages')}<span>Sites</span></button>
        <button class="nav-button ${active === 'templates' ? 'active' : ''}" data-nav="templates">${icon('templates')}<span>Templates</span></button>
        <button class="nav-button ${active === 'settings' ? 'active' : ''}" data-nav="settings">${icon('settings')}<span>Settings</span></button>
      </nav>
      <div class="sidebar-bottom">
        <button class="nav-button" data-action="theme">${icon(state.theme === 'dark' ? 'sun' : 'moon')}<span>${state.theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span></button>
        <button class="nav-button" data-action="logout">${icon('logout')}<span>Log out</span></button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="search-wrap">${icon('search')}<input class="search" id="global-search" data-search-scope="${searchTemplates ? 'templates' : 'sites'}" value="${escapeHtml(searchValue)}" placeholder="${searchPlaceholder}"></div>
        <div class="top-actions">
          <button class="icon-button mobile-menu" data-action="menu" aria-label="Open menu">${icon('menu')}</button>
          <button class="icon-button theme-toggle" data-action="theme" aria-label="Change appearance">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button>
          <button class="btn primary" data-action="create-site">${icon('plus')}<span>New website</span></button>
        </div>
      </header>
      <div class="content">${content}</div>
    </main>
  </div>${renderModal()}`;
}

function loginView() {
  return `<main class="login-page">
    <form class="login-card" id="login-form">
      <img class="login-logo" src="/admin/logo.svg" alt="Pages">
      <h1>Welcome to Pages</h1>
      <p>Publish beautiful static websites directly from your Umbrel.</p>
      <div class="field"><label for="password">Umbrel app password</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required autofocus></div>
      <button class="btn primary" type="submit">Open Pages</button>
      <div class="login-foot">Your password is only used on your own server.</div>
    </form>
  </main>`;
}

function statCard(iconName, value, label, tone = '') {
  return `<article class="stat-card ${tone}"><div class="stat-icon">${icon(iconName)}</div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div></article>`;
}

function templateName(id) {
  return state.templates.find(template => template.id === id)?.name || 'Custom';
}

function templatePreviewUrl(id) {
  return `/template-preview/${encodeURIComponent(id)}/`;
}

function filteredTemplates() {
  const query = state.templateSearch.trim().toLowerCase();
  return state.templates.filter(template => {
    const categoryMatch = state.templateCategory === 'All' || template.category === state.templateCategory;
    const queryMatch = !query || [template.name, template.description, template.category, ...(template.tags || [])].join(' ').toLowerCase().includes(query);
    return categoryMatch && queryMatch;
  });
}

function preferredSiteUrl(site) {
  const url = siteUrls(site).preferred;
  return site.published ? url : `${url}${url.includes('?') ? '&' : '?'}preview=1`;
}

function filteredSites() {
  const query = state.search.trim().toLowerCase();
  let sites = state.sites;
  if (currentRoute().view === 'sites' && state.siteFilter !== 'all') sites = sites.filter(site => state.siteFilter === 'published' ? site.published : !site.published);
  if (!query) return sites;
  return sites.filter(site => [site.name, site.slug, site.description, ...(site.domains || [])].join(' ').toLowerCase().includes(query));
}

function siteCard(site) {
  const urls = siteUrls(site);
  const displayUrl = site.domains?.[0] || urls.local || site.public_path;
  return `<article class="site-card" data-open-site="${site.id}">
    <div class="site-preview"><iframe loading="lazy" src="${site.public_path}?preview=1" title="${escapeHtml(site.name)} preview" tabindex="-1"></iframe><span class="site-card-state ${site.published ? 'published' : 'draft'}">${site.published ? 'Published' : 'Draft'}</span></div>
    <div class="site-body">
      <div class="site-title-row"><div class="site-title">${escapeHtml(site.name)}</div><span class="status ${site.published ? '' : 'draft'}">${site.published ? 'Live' : 'Draft'}</span></div>
      <div class="site-url">${escapeHtml(displayUrl)}</div>
      <div class="site-network-row"><span class="network-chip">${icon('wifi')}Local</span>${urls.onion ? `<span class="network-chip tor">${icon('tor')}Umbrel Onion</span>` : ''}${site.independent_onion?.created ? `<span class="network-chip tor managed">${icon('tor')}Own Onion</span>` : ''}<span class="network-chip">${icon('templates')}${escapeHtml(templateName(site.template_id))}</span></div>
      <div class="site-meta"><span>${icon('eye')}${formatNumber(site.views)} views</span><span>${icon('harddrive')}${formatBytes(site.size)}</span><span>${relativeTime(site.updated_at)}</span></div>
    </div>
  </article>`;
}

function sitesSection(sites) {
  if (!sites.length) {
    return `<div class="empty"><div><div class="empty-icon">${icon('pages')}</div><h2>${state.search ? 'No websites found' : 'Create your first website'}</h2><p>${state.search ? 'Try another search term.' : 'Start from a polished template, upload a folder, or import a ready-made ZIP archive.'}</p>${state.search ? '' : `<button class="btn primary" data-action="create-site">${icon('plus')}New website</button>`}</div></div>`;
  }
  return `<div class="sites-grid">${sites.map(siteCard).join('')}</div>`;
}

function accessOverview() {
  const access = accessInfo();
  const localOrigin = access.local_origin || location.origin;
  const onionOrigin = access.onion_origin || '';
  return `<section class="access-overview">
    <div class="access-overview-copy"><span class="eyebrow">Access</span><h2>Ready on your network${onionOrigin ? ' and over Tor' : ''}.</h2><p>Every website receives a dedicated local link${onionOrigin ? ' and an Onion link automatically' : ''}.</p></div>
    <div class="access-overview-items">
      <div class="access-mini-card"><div class="access-mini-icon">${icon('wifi')}</div><div><strong>Local network</strong><span>${escapeHtml(localOrigin)}</span></div><button class="mini-icon" data-copy-url="${escapeHtml(localOrigin)}" title="Copy local address">${icon('copy')}</button></div>
      <div class="access-mini-card ${onionOrigin ? '' : 'muted'}"><div class="access-mini-icon tor">${icon('tor')}</div><div><strong>Tor hidden service</strong><span>${escapeHtml(onionOrigin || (access.onion_pending ? 'Waiting for Umbrel' : 'Not available'))}</span></div>${onionOrigin ? `<button class="mini-icon" data-copy-url="${escapeHtml(onionOrigin)}" title="Copy Onion address">${icon('copy')}</button>` : '<span class="access-state">Offline</span>'}</div>
    </div>
  </section>`;
}

function dashboardView() {
  const totals = state.dashboard?.totals || {};
  const sites = filteredSites().slice(0, 6);
  const storagePercent = Math.min(100, Math.max(2, ((totals.storage || 0) / (10 * 1024 ** 3)) * 100));
  const access = accessInfo();
  const managedTor = state.system?.managed_tor || {};
  const torState = access.onion_origin || managedTor.state === 'ready' ? 'ready' : managedTor.state === 'starting' ? 'starting' : 'waiting';
  const torLabel = torState === 'ready' ? 'Ready' : torState === 'starting' ? `Starting${Number.isFinite(managedTor.bootstrap_progress) ? ` · ${managedTor.bootstrap_progress}%` : ''}` : 'Waiting';
  return shell(`<div class="page-head compact"><div><h1>Overview</h1><p>Your sites at a glance.</p></div><div class="actions"><button class="btn" data-action="import-new">${icon('upload')}Import site</button><button class="btn primary" data-action="create-site">${icon('plus')}New site</button></div></div>
    <section class="stats-grid dashboard-stats">
      ${statCard('pages', formatNumber(totals.sites || 0), 'Sites')}
      ${statCard('check', formatNumber(totals.published || 0), 'Published', 'success')}
      ${statCard('draft', formatNumber(totals.drafts || 0), 'Drafts', 'warning')}
      ${statCard('eye', formatNumber(totals.views || 0), 'Visits')}
    </section>
    <div class="dashboard-layout">
      <section class="panel recent-panel"><div class="panel-head"><h3>Recent sites</h3><button class="text-button" data-nav="sites">View all</button></div>${sites.length ? `<div class="recent-table">${sites.map(site => { const url=siteUrls(site); return `<button class="recent-row" data-open-site="${site.id}"><div class="recent-thumb"><iframe src="${site.public_path}?preview=1" tabindex="-1"></iframe></div><div class="recent-name"><strong>${escapeHtml(site.name)}</strong><span>${escapeHtml(site.domains?.[0] || url.local || site.public_path)}</span></div><span class="table-status ${site.published ? 'published' : 'draft'}">${site.published ? 'Published' : 'Draft'}</span><span class="recent-views"><strong>${formatNumber(site.views)}</strong><small>visits</small></span><span class="recent-more">${icon('more')}</span></button>`}).join('')}</div>` : `<div class="empty mini"><div><div class="empty-icon">${icon('pages')}</div><h2>Create your first site</h2><p>Start with a polished template or import your own files.</p><button class="btn primary" data-action="create-site">${icon('plus')}New site</button></div></div>`}</section>
      <aside class="dashboard-side">
        <section class="panel"><div class="panel-head"><h3>Quick actions</h3></div><div class="quick-actions"><button data-action="create-site">${icon('plus')}New site</button><button data-action="import-new">${icon('upload')}Import site</button><button data-nav="templates">${icon('templates')}Create from template</button></div></section>
        <section class="panel"><div class="panel-head"><h3>Storage</h3><span class="panel-value">${formatBytes(totals.storage || 0)} / 10 GB</span></div><div class="storage-body"><div class="storage-track"><i style="width:${storagePercent}%"></i></div><small>Website files and generated content</small></div></section>
        <section class="panel"><div class="panel-head"><h3>System status</h3></div><div class="status-list"><div><span class="status-dot online"></span><strong>Server</strong><small>Online</small></div><div><span class="status-dot online"></span><strong>Backups</strong><small>${formatNumber(totals.backups || 0)} local</small></div><div><span class="status-dot ${torState === 'ready' ? 'online' : 'waiting'}"></span><strong>Tor</strong><small>${escapeHtml(torLabel)}</small></div></div></section>
      </aside>
    </div>`, 'dashboard');
}

function sitesView() {
  const sites = filteredSites();
  const counts = { all: state.sites.length, published: state.sites.filter(site => site.published).length, drafts: state.sites.filter(site => !site.published).length };
  return shell(`<div class="page-head"><div><h1>Sites</h1><p>Build, publish and share every website from one place.</p></div><div class="actions"><button class="btn" data-action="import-new">${icon('upload')}Import ZIP</button><button class="btn primary" data-action="create-site">${icon('plus')}New website</button></div></div><div class="filter-bar"><div class="filter-pills">${[['all','All'],['published','Published'],['drafts','Drafts']].map(([id,label])=>`<button class="filter-pill ${state.siteFilter===id?'active':''}" data-site-filter="${id}">${label}<span>${counts[id]}</span></button>`).join('')}</div><button class="btn small" data-nav="templates">${icon('templates')}Browse templates</button></div>${sitesSection(sites)}`, 'sites');
}

function templateCardView(template) {
  return `<article class="library-card"><div class="library-preview"><iframe loading="lazy" src="${templatePreviewUrl(template.id)}" title="${escapeHtml(template.name)} preview" tabindex="-1"></iframe><div class="preview-actions"><button class="preview-button" data-preview-template="${template.id}">${icon('eye')}Preview</button></div></div><div class="library-copy"><div class="library-title"><div><h3>${escapeHtml(template.name)}</h3><p>${escapeHtml(template.description)}</p></div><span class="template-category">${escapeHtml(template.category)}</span></div><div class="library-foot"><div class="template-tags">${(template.tags || []).map(tag=>`<span>${escapeHtml(tag)}</span>`).join('')}</div><button class="btn small primary" data-use-template="${template.id}">Use template</button></div></div></article>`;
}

function templatesView() {
  const templates = filteredTemplates();
  const categories = ['All', ...new Set(state.templates.map(template => template.category))];
  const featured = state.templates.filter(template => template.featured).slice(0, 4);
  return shell(`<div class="template-hero"><div><span class="eyebrow">Template library</span><h1>Start beautifully.<br>Make it yours.</h1><p>Professionally designed starters made entirely from editable HTML and CSS. No external services, tracking or remote assets.</p><div class="actions"><button class="btn primary" data-use-template="portfolio">${icon('plus')}Create from a template</button><button class="btn" data-preview-template="portfolio">${icon('eye')}Preview featured</button></div></div><div class="hero-template-stack">${featured.map((template,index)=>`<div class="stack-card s${index+1}"><iframe src="${templatePreviewUrl(template.id)}" tabindex="-1"></iframe></div>`).join('')}</div></div><div class="template-toolbar"><div class="filter-pills">${categories.map(category=>`<button class="filter-pill ${state.templateCategory===category?'active':''}" data-template-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('')}</div><span>${templates.length} ${templates.length===1?'template':'templates'}</span></div>${templates.length ? `<div class="library-grid">${templates.map(templateCardView).join('')}</div>` : `<div class="empty"><div><div class="empty-icon">${icon('templates')}</div><h2>No templates found</h2><p>Try another category or search term.</p></div></div>`}`, 'templates');
}

function settingsView() {
  const access=accessInfo(); const totals=state.dashboard?.totals||{}; const managedTor=state.system?.managed_tor||{};
  const managedTorValue = managedTor.state === 'ready' ? 'Ready' : managedTor.state === 'starting' ? `Starting · ${managedTor.bootstrap_progress || 0}%` : managedTor.last_error ? 'Unavailable' : 'Waiting';
  return shell(`<div class="page-head"><div><h1>Settings</h1><p>Pages system information and publishing access.</p></div></div><div class="global-settings-grid"><section class="panel"><div class="panel-head"><h3>Access</h3></div><div class="panel-body quick-list"><div class="quick-row"><div class="quick-row-icon">${icon('wifi')}</div><div><strong>Local network</strong><small>Primary Umbrel address</small></div><div class="value">${escapeHtml(access.local_origin || location.origin)}</div></div><div class="quick-row"><div class="quick-row-icon tor">${icon('tor')}</div><div><strong>Umbrel Onion</strong><small>Shared app Hidden Service</small></div><div class="value">${escapeHtml(access.onion_origin || (access.onion_pending ? 'Waiting for Umbrel' : 'Unavailable'))}</div></div><div class="quick-row"><div class="quick-row-icon tor">${icon('tor')}</div><div><strong>Independent Onion engine</strong><small>Dedicated Tor service for website identities</small></div><div class="value">${escapeHtml(managedTorValue)}</div></div></div></section><section class="panel"><div class="panel-head"><h3>Application</h3></div><div class="panel-body quick-list"><div class="quick-row"><div class="quick-row-icon">${icon('server')}</div><div><strong>Pages version</strong><small>Installed application release</small></div><div class="value">${escapeHtml(state.system?.version || '0.1.1')}</div></div><div class="quick-row"><div class="quick-row-icon">${icon('templates')}</div><div><strong>Included templates</strong><small>Locally available starters</small></div><div class="value">${state.templates.length}</div></div><div class="quick-row"><div class="quick-row-icon">${icon('harddrive')}</div><div><strong>Website storage</strong><small>Current content size</small></div><div class="value">${formatBytes(totals.storage || 0)}</div></div></div></section><section class="panel settings-wide"><div class="panel-head"><h3>Privacy and operation</h3></div><div class="settings-info"><article>${icon('shield')}<div><strong>Local-first by design</strong><p>Website files, backups, statistics and configuration stay on this Umbrel.</p></div></article><article>${icon('code')}<div><strong>Static files only</strong><p>Pages serves HTML, CSS, JavaScript and assets without executing uploaded server-side code.</p></div></article><article>${icon('qr')}<div><strong>Private sharing tools</strong><p>QR codes are generated locally, while Onion links can use either Umbrel's shared service or a dedicated per-site identity.</p></div></article></div></section></div>`, 'settings');
}

function siteHeader(site) {
  const openUrl = preferredSiteUrl(site);
  return `<div class="detail-header">
    <button class="back-button" data-nav="sites" aria-label="Back">${icon('arrow')}</button>
    <div class="detail-title"><div class="detail-name-row"><h1>${escapeHtml(site.name)}</h1><span class="table-status ${site.published ? 'published' : 'draft'}">${site.published ? 'Published' : 'Draft'}</span></div><p>${escapeHtml(siteUrls(site).local || siteUrls(site).preferred)}</p></div>
    <div class="detail-actions"><button class="btn ${site.published ? '' : 'primary'}" data-action="toggle-publish">${icon(site.published ? 'draft' : 'publish')}${site.published ? 'Unpublish' : 'Publish'}</button><a class="btn" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener">${icon('external')}${site.published ? 'Open website' : 'Preview'}</a><button class="btn" data-action="show-sharing">${icon('link')}Share</button><button class="btn primary" data-action="upload-menu">${icon('upload')}Upload</button></div>
  </div>`;
}

function tabs(site) {
  const items = [['overview', 'Overview'], ['files', 'Files'], ['domains', 'Sharing'], ['backups', 'Backups'], ['settings', 'Settings']];
  return `<div class="tabs">${items.map(([id, label]) => `<button class="tab ${state.currentTab === id ? 'active' : ''}" data-site-tab="${id}" data-site-id="${site.id}">${label}</button>`).join('')}</div>`;
}

function overviewTab(site) {
  const urls = siteUrls(site);
  const publicUrl = preferredSiteUrl(site);
  return `<div class="overview-grid">
    <section class="panel"><div class="panel-head"><h3>Live preview</h3><a class="btn small ghost" href="${escapeHtml(publicUrl)}" target="_blank">Open ${icon('external')}</a></div><div class="panel-body"><div class="browser-frame"><div class="browser-bar"><i class="browser-dot"></i><i class="browser-dot"></i><i class="browser-dot"></i><div class="browser-address">${escapeHtml(publicUrl)}</div></div><iframe src="${site.public_path}?preview=full" title="Website preview"></iframe></div></div></section>
    <section class="panel"><div class="panel-head"><h3>Website details</h3><button class="btn small ghost" data-action="show-sharing">Share ${icon('link')}</button></div><div class="panel-body quick-list">
      <div class="quick-row"><div class="quick-row-icon">${icon('wifi')}</div><div><strong>Local access</strong><small>Umbrel network address</small></div><div class="value">${escapeHtml(urls.local || 'Unavailable')}</div></div>
      <div class="quick-row"><div class="quick-row-icon tor">${icon('tor')}</div><div><strong>Onion access</strong><small>Available in Tor Browser</small></div><div class="value">${escapeHtml(urls.onion ? 'Ready' : 'Unavailable')}</div></div>
      <div class="quick-row"><div class="quick-row-icon">${icon('eye')}</div><div><strong>Page views</strong><small>HTML requests</small></div><div class="value">${formatNumber(site.views)}</div></div>
      <div class="quick-row"><div class="quick-row-icon">${icon('harddrive')}</div><div><strong>Storage</strong><small>Website files</small></div><div class="value">${formatBytes(site.size)}</div></div>
      <div class="quick-row"><div class="quick-row-icon">${icon('clock')}</div><div><strong>Last updated</strong><small>Latest change</small></div><div class="value">${relativeTime(site.updated_at)}</div></div>
    </div></section>
  </div>`;
}

function treeHtml(nodes, depth = 0) {
  return nodes.map(node => {
    if (node.type === 'directory') {
      return `<div><button class="tree-row" data-toggle-folder="${escapeHtml(node.path)}" style="padding-left:${9 + depth * 9}px">${icon('folder')}<span>${escapeHtml(node.name)}</span></button><div class="tree-children">${treeHtml(node.children || [], depth + 1)}</div></div>`;
    }
    return `<button class="tree-row ${state.currentFile?.path === node.path ? 'active' : ''}" data-open-file="${escapeHtml(node.path)}" style="padding-left:${9 + depth * 9}px">${icon(node.editable ? 'code' : 'file')}<span>${escapeHtml(node.name)}</span></button>`;
  }).join('');
}

function filesTab(site) {
  return `<section class="file-layout">
    <aside class="file-sidebar"><div class="file-toolbar"><strong>Files</strong><div class="file-actions"><button class="mini-icon" data-action="new-file" title="New file">${icon('filePlus')}</button><button class="mini-icon" data-action="new-folder" title="New folder">${icon('folderPlus')}</button><button class="mini-icon" data-action="upload-menu" title="Upload">${icon('upload')}</button></div></div><div class="file-tree">${state.files.length ? treeHtml(state.files) : '<div style="padding:20px;color:var(--muted);font-size:12px;text-align:center">This website has no files.</div>'}</div></aside>
    <div class="editor">
      ${state.currentFile ? `<div class="editor-head"><div class="editor-path">/${escapeHtml(state.currentFile.path)}</div><button class="btn small danger" data-action="delete-file">${icon('trash')}Delete</button><button class="btn small primary" data-action="save-file">${icon('save')}Save</button></div><textarea class="editor-area" id="editor" spellcheck="false">${escapeHtml(state.editorContent)}</textarea>` : `<div class="editor-placeholder"><div>${icon('code')}<strong>Select a file to start editing</strong><p>HTML, CSS, JavaScript, JSON, Markdown and other text files can be edited directly.</p></div></div>`}
    </div>
  </section>`;
}

function shareAddressCard({ kind, title, subtitle, url, available = true, unavailableText = '' }) {
  const iconName = kind === 'onion' ? 'tor' : kind === 'domain' ? 'globe' : 'wifi';
  return `<article class="share-card ${kind} ${available ? '' : 'unavailable'}">
    <div class="share-card-head"><div class="share-icon">${icon(iconName)}</div><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div><span class="share-status">${available ? 'Ready' : 'Unavailable'}</span></div>
    ${available ? `<div class="share-url"><code>${escapeHtml(url)}</code><button class="mini-icon" data-copy-url="${escapeHtml(url)}" title="Copy address">${icon('copy')}</button></div><div class="share-actions"><a class="btn small" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon('external')}Open</a><button class="btn small" data-copy-url="${escapeHtml(url)}">${icon('copy')}Copy</button><button class="btn small" data-qr-url="${escapeHtml(url)}" data-qr-title="${escapeHtml(title)}">${icon('qr')}QR code</button></div>` : `<div class="share-unavailable-copy">${escapeHtml(unavailableText || 'This address is not available yet.')}</div>`}
  </article>`;
}

function independentOnionCard(site) {
  const onion = site.independent_onion || { created: false, enabled: false, state: 'not_created' };
  const url = onion.url || '';
  const stateLabels = { not_created: 'Not created', waiting: 'Waiting', starting: 'Starting', ready: 'Ready', disabled: 'Disabled', error: 'Error' };
  const status = stateLabels[onion.state] || 'Waiting';
  const ready = onion.ready && onion.enabled;
  const created = onion.created;
  let body = '';
  if (!created) {
    body = `<div class="managed-onion-empty"><p>Generate a dedicated Onion v3 identity for this website. It will open directly at its own <code>.onion</code> root address without the Umbrel hostname or a <code>/p/</code> path.</p><button class="btn small primary" data-action="generate-onion">${icon('tor')}Generate Onion address</button></div>`;
  } else {
    body = `<div class="share-url"><code>${escapeHtml(url)}</code><button class="mini-icon" data-copy-url="${escapeHtml(url)}" title="Copy address">${icon('copy')}</button></div>
      ${onion.last_error ? `<div class="managed-onion-error">${icon('alert')}<span>${escapeHtml(onion.last_error)}</span></div>` : ''}
      <div class="share-actions managed-onion-actions">
        ${ready ? `<a class="btn small" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon('external')}Open</a>` : ''}
        <button class="btn small" data-copy-url="${escapeHtml(url)}">${icon('copy')}Copy</button>
        <button class="btn small" data-qr-url="${escapeHtml(url)}" data-qr-title="Independent Onion address">${icon('qr')}QR code</button>
        ${onion.enabled ? `<button class="btn small" data-action="disable-onion">${icon('close')}Disable</button>` : `<button class="btn small primary" data-action="enable-onion">${icon('publish')}Enable</button>`}
        <button class="btn small danger-soft" data-action="regenerate-onion">${icon('refresh')}Regenerate</button>
      </div>`;
  }
  return `<article class="share-card onion managed-onion ${created ? '' : 'unavailable'}">
    <div class="share-card-head"><div class="share-icon">${icon('tor')}</div><div><strong>Independent Onion</strong><span>A separate Tor identity used only by this website</span></div><span class="share-status state-${escapeHtml(onion.state)}">${escapeHtml(status)}</span></div>
    ${body}
  </article>`;
}

function domainsTab(site) {
  const urls = siteUrls(site);
  const access = accessInfo();
  return `<div class="sharing-layout">
    <section class="panel share-panel"><div class="panel-head"><div><h3>Website addresses</h3><p>Copy, open or turn any address into a QR code.</p></div></div><div class="panel-body share-grid three">
      ${shareAddressCard({ kind: 'local', title: 'Local network', subtitle: 'For devices on your Umbrel network', url: urls.local, available: Boolean(urls.local), unavailableText: 'Pages could not determine the local Umbrel address.' })}
      ${shareAddressCard({ kind: 'onion', title: 'Umbrel Onion', subtitle: 'The shared Hidden Service supplied by Umbrel', url: urls.onion, available: Boolean(urls.onion), unavailableText: 'Umbrel has not provided a usable hidden-service address yet. Enable Tor remote access if necessary, then restart Pages.' })}
      ${independentOnionCard(site)}
    </div><div class="share-note">${icon('shield')}<div><strong>Choose shared or independent Tor publishing.</strong><span>The Umbrel Onion keeps the familiar <code>/p/${escapeHtml(site.slug)}/</code> path. The independent Onion uses its own persistent identity and opens this website directly at <code>/</code>.</span></div></div></section>
    <div class="settings-grid sharing-settings"><section class="panel"><div class="panel-head"><h3>Custom domains</h3></div><form id="domains-form" class="form-section"><p>Point a reverse proxy at Pages and add the incoming hostname here. One domain per line.</p><div class="field"><label for="domains">Domain names</label><textarea class="textarea" id="domains" name="domains" placeholder="pages.example.com
www.example.com">${escapeHtml((site.domains || []).join('\n'))}</textarea><small>Enter hostnames only, without http://, paths or port numbers.</small></div><div class="actions" style="margin-top:16px"><button class="btn primary" type="submit">Save domains</button></div></form>${urls.custom.length ? `<div class="custom-domain-list">${urls.custom.map((url, index) => `<div class="custom-domain-row"><div class="share-icon">${icon('globe')}</div><div><strong>${escapeHtml(site.domains[index])}</strong><span>${escapeHtml(url)}</span></div><button class="mini-icon" data-copy-url="${escapeHtml(url)}" title="Copy domain">${icon('copy')}</button><button class="mini-icon" data-qr-url="${escapeHtml(url)}" data-qr-title="Custom domain" title="Show QR code">${icon('qr')}</button></div>`).join('')}</div>` : ''}</section>
      <section class="panel"><div class="panel-head"><h3>Reverse proxy target</h3></div><div class="panel-body"><div class="quick-list"><div class="quick-row"><div class="quick-row-icon">${icon('link')}</div><div><strong>Target host</strong><small>Your Umbrel hostname</small></div><div class="value">${escapeHtml(access.local_host || location.hostname)}</div></div><div class="quick-row"><div class="quick-row-icon">${icon('terminal')}</div><div><strong>Target port</strong><small>Pages app port</small></div><div class="value">${escapeHtml(access.local_port || location.port || '80')}</div></div></div><p class="proxy-help">Keep the original Host header enabled in NPMplus, Nginx Proxy Manager, Pangolin or your other reverse proxy.</p></div></section></div>
  </div>`;
}

function backupsTab(site) {
  return `<section class="panel"><div class="panel-head"><h3>Local backups</h3><button class="btn small primary" data-action="create-backup">${icon('plus')}Create backup</button></div><div class="panel-body">${state.backups.length ? `<div class="backup-list">${state.backups.map(backup => `<div class="backup-item"><div class="backup-item-icon">${icon('archive')}</div><div class="backup-item-copy"><strong>${escapeHtml(backup.filename)}</strong><small>${new Date(backup.created_at).toLocaleString()} · ${formatBytes(backup.size)}</small></div><div class="backup-item-actions"><button class="btn small" data-restore-backup="${backup.id}">${icon('refresh')}Restore</button><button class="mini-icon" data-delete-backup="${backup.id}" title="Delete">${icon('trash')}</button></div></div>`).join('')}</div>` : `<div class="empty" style="min-height:260px"><div><div class="empty-icon">${icon('archive')}</div><h2>No backups yet</h2><p>Create a local snapshot before making major changes to this website.</p><button class="btn primary" data-action="create-backup">${icon('plus')}Create backup</button></div></div>`}</div></section>`;
}

function settingsTab(site) {
  return `<div class="settings-grid">
    <section class="panel"><div class="panel-head"><h3>Website settings</h3></div><form id="settings-form">
      <div class="form-section"><h3>General</h3><p>Change how this website appears inside Pages and where it is published.</p><div class="form-grid"><div class="field"><label for="site-name">Website name</label><input class="input" id="site-name" name="name" value="${escapeHtml(site.name)}" required></div><div class="field"><label for="site-slug">URL slug</label><input class="input" id="site-slug" name="slug" value="${escapeHtml(site.slug)}" required></div><div class="field full"><label for="site-description">Description</label><textarea class="textarea" id="site-description" name="description">${escapeHtml(site.description || '')}</textarea></div></div></div>
      <div class="form-section"><h3>Publishing</h3><p>Choose whether this website is publicly reachable.</p><div class="toggle-row"><div class="toggle-copy"><strong>Published</strong><small>Allow access through local, Onion and custom-domain addresses.</small></div><label class="switch"><input name="published" type="checkbox" ${site.published ? 'checked' : ''}><span class="slider"></span></label></div></div>
      <div class="form-section"><h3>Serving behavior</h3><p>Control routing, browser caching and cross-origin access.</p>
        <div class="toggle-row"><div class="toggle-copy"><strong>Single-page application fallback</strong><small>Serve index.html when a route does not match a file.</small></div><label class="switch"><input name="spa_fallback" type="checkbox" ${site.spa_fallback ? 'checked' : ''}><span class="slider"></span></label></div>
        <div class="toggle-row"><div class="toggle-copy"><strong>Directory listing</strong><small>Show folder contents when no index file exists.</small></div><label class="switch"><input name="directory_listing" type="checkbox" ${site.directory_listing ? 'checked' : ''}><span class="slider"></span></label></div>
        <div class="toggle-row"><div class="toggle-copy"><strong>Allow CORS</strong><small>Allow other websites and apps to fetch public files.</small></div><label class="switch"><input name="cors" type="checkbox" ${site.cors ? 'checked' : ''}><span class="slider"></span></label></div>
        <div class="field" style="margin-top:16px"><label for="cache-policy">Static file cache</label><select class="select" name="cache_policy" id="cache-policy"><option value="none" ${site.cache_policy === 'none' ? 'selected' : ''}>No cache</option><option value="1h" ${site.cache_policy === '1h' ? 'selected' : ''}>1 hour</option><option value="1d" ${site.cache_policy === '1d' ? 'selected' : ''}>1 day</option><option value="30d" ${site.cache_policy === '30d' ? 'selected' : ''}>30 days</option></select></div>
      </div><div class="form-section"><button class="btn primary" type="submit">Save changes</button></div>
    </form></section>
    <div><section class="panel"><div class="panel-head"><h3>Website actions</h3></div><div class="panel-body" style="display:grid;gap:9px"><button class="btn" data-action="duplicate-site">${icon('copy')}Duplicate website</button><a class="btn" href="/api/sites/${site.id}/export">${icon('download')}Export as ZIP</a><button class="btn" data-action="import-zip">${icon('upload')}Replace from ZIP</button></div></section>
    <section class="panel danger-zone" style="margin-top:18px"><div class="panel-head"><h3>Danger zone</h3></div><div class="panel-body"><p style="color:var(--muted);font-size:12px;line-height:1.5;margin:0 0 14px">Deleting a website permanently removes its files, settings and backups.</p><button class="btn danger" data-action="delete-site">${icon('trash')}Delete website</button></div></section></div>
  </div>`;
}

function siteView() {
  const site = state.currentSite;
  if (!site) return shell('<div class="skeleton"></div>', 'sites');
  let body = overviewTab(site);
  if (state.currentTab === 'files') body = filesTab(site);
  if (state.currentTab === 'domains') body = domainsTab(site);
  if (state.currentTab === 'backups') body = backupsTab(site);
  if (state.currentTab === 'settings') body = settingsTab(site);
  return shell(`${siteHeader(site)}${tabs(site)}${body}`, 'sites');
}

function createSiteModal() {
  const selectedId = state.modal?.template || 'portfolio';
  const selected = state.templates.find(template => template.id === selectedId) || state.templates[0] || { id: 'portfolio', name: 'Portfolio', description: '' };
  return `<div class="modal-backdrop" data-modal-backdrop><div class="modal create-modal" data-modal-stop><div class="modal-head"><div><h2>Create a website</h2><p>Choose a template, give it a name and decide when to publish.</p></div><button class="close" data-action="close-modal">${icon('close')}</button></div><form id="create-site-form"><div class="modal-body"><div class="create-template-feature"><div class="create-template-preview"><iframe id="create-template-iframe" src="${templatePreviewUrl(selected.id)}" tabindex="-1"></iframe></div><div class="create-template-copy"><span>Selected template</span><h3 id="create-template-name">${escapeHtml(selected.name)}</h3><p id="create-template-description">${escapeHtml(selected.description)}</p><button class="text-button" type="button" data-action="browse-templates">Browse full library →</button></div></div><label class="field-label">Choose a starting point</label><div class="modal-template-strip">${state.templates.map(template => templateCard(template.id, template.icon, template.name, template.description, template.id === selected.id)).join('')}</div><div class="form-grid create-fields"><div class="field"><label for="new-name">Website name</label><input class="input" id="new-name" name="name" placeholder="My website" required autofocus></div><div class="field"><label for="new-slug">URL slug</label><input class="input" id="new-slug" name="slug" placeholder="my-website"></div></div><div class="toggle-row publish-on-create"><div class="toggle-copy"><strong>Publish immediately</strong><small>Turn this off to keep the new website as a private draft.</small></div><label class="switch"><input name="published" type="checkbox" checked><span class="slider"></span></label></div><input type="hidden" name="template" value="${escapeHtml(selected.id)}"></div><div class="modal-foot"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Create website</button></div></form></div></div>`;
}

function templateCard(id, iconName, name, description, active = false) {
  return `<button type="button" class="template-card compact ${active ? 'active' : ''}" data-template="${id}" title="${escapeHtml(description)}"><div class="template-icon">${icon(iconName)}</div><strong>${escapeHtml(name)}</strong></button>`;
}

function uploadModal() {
  return `<div class="modal-backdrop" data-modal-backdrop><div class="modal small" data-modal-stop><div class="modal-head"><div><h2>Add website files</h2><p>Upload individual files, a complete folder, or replace everything from a ZIP.</p></div><button class="close" data-action="close-modal">${icon('close')}</button></div><div class="modal-body" style="display:grid;gap:10px"><button class="btn" data-upload-choice="files">${icon('filePlus')}Upload files</button><button class="btn" data-upload-choice="folder">${icon('folderPlus')}Upload folder</button><button class="btn" data-upload-choice="zip">${icon('archive')}Import ZIP archive</button></div><div class="modal-foot"><button class="btn" data-action="close-modal">Cancel</button></div></div></div>`;
}

function promptModal(kind) {
  const file = kind === 'file';
  return `<div class="modal-backdrop" data-modal-backdrop><div class="modal small" data-modal-stop><div class="modal-head"><div><h2>New ${file ? 'file' : 'folder'}</h2><p>Use a path to create it inside another folder.</p></div><button class="close" data-action="close-modal">${icon('close')}</button></div><form id="path-form" data-kind="${kind}"><div class="modal-body"><div class="field"><label for="new-path">Path</label><input class="input" id="new-path" name="path" placeholder="${file ? 'assets/main.js' : 'assets/images'}" required autofocus></div></div><div class="modal-foot"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Create</button></div></form></div></div>`;
}

function confirmModal(action, title, message, label = 'Delete') {
  return `<div class="modal-backdrop" data-modal-backdrop><div class="modal small" data-modal-stop><div class="modal-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div><button class="close" data-action="close-modal">${icon('close')}</button></div><div class="modal-foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn danger" data-confirm="${action}">${escapeHtml(label)}</button></div></div></div>`;
}

function qrModal(url, title = 'Website address') {
  const source = `/api/share/qr?url=${encodeURIComponent(url)}`;
  return `<div class="modal-backdrop" data-modal-backdrop><div class="modal qr-modal" data-modal-stop><div class="modal-head"><div><h2>${escapeHtml(title)}</h2><p>Scan this code with another device to open the website.</p></div><button class="close" data-action="close-modal">${icon('close')}</button></div><div class="modal-body qr-modal-body"><div class="qr-frame"><img src="${escapeHtml(source)}" alt="QR code for ${escapeHtml(url)}"></div><div class="qr-address"><span>${icon(url.includes('.onion') ? 'tor' : 'link')}</span><code>${escapeHtml(url)}</code></div></div><div class="modal-foot"><button class="btn" data-copy-url="${escapeHtml(url)}">${icon('copy')}Copy address</button><a class="btn primary" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon('external')}Open website</a></div></div></div>`;
}

function templatePreviewModal(templateId) {
  const template = state.templates.find(item => item.id === templateId);
  if (!template) return '';
  return `<div class="modal-backdrop" data-modal-backdrop><div class="modal template-preview-modal" data-modal-stop><div class="modal-head"><div><span class="template-category">${escapeHtml(template.category)}</span><h2>${escapeHtml(template.name)}</h2><p>${escapeHtml(template.description)}</p></div><button class="close" data-action="close-modal">${icon('close')}</button></div><div class="template-preview-browser"><div class="browser-bar"><i class="browser-dot"></i><i class="browser-dot"></i><i class="browser-dot"></i><div class="browser-address">Preview · ${escapeHtml(template.name)}</div></div><iframe src="${templatePreviewUrl(template.id)}" title="${escapeHtml(template.name)}"></iframe></div><div class="modal-foot"><button class="btn" data-action="close-modal">Close</button><button class="btn primary" data-use-template="${template.id}">${icon('plus')}Use this template</button></div></div></div>`;
}

function renderModal() {
  if (!state.modal) return '';
  if (state.modal.type === 'create') return createSiteModal();
  if (state.modal.type === 'upload') return uploadModal();
  if (state.modal.type === 'prompt') return promptModal(state.modal.kind);
  if (state.modal.type === 'confirm') return confirmModal(state.modal.action, state.modal.title, state.modal.message, state.modal.label);
  if (state.modal.type === 'qr') return qrModal(state.modal.url, state.modal.title);
  if (state.modal.type === 'template-preview') return templatePreviewModal(state.modal.template);
  return '';
}

function render() {
  if (state.loading) {
    app.innerHTML = `<main class="login-page"><div class="login-card"><img class="login-logo" src="/admin/logo.svg" alt=""><div class="skeleton" style="height:120px"></div></div></main>`;
    return;
  }
  if (!state.authenticated) {
    app.innerHTML = loginView();
    bindForms();
    return;
  }
  const route = currentRoute();
  if (route.view === 'site') app.innerHTML = siteView();
  else if (route.view === 'sites') app.innerHTML = sitesView();
  else if (route.view === 'templates') app.innerHTML = templatesView();
  else if (route.view === 'settings') app.innerHTML = settingsView();
  else app.innerHTML = dashboardView();
  bindForms();
}

function bindForms() {
  document.querySelector('#login-form')?.addEventListener('submit', login);
  document.querySelector('#create-site-form')?.addEventListener('submit', createSite);
  document.querySelector('#settings-form')?.addEventListener('submit', saveSettings);
  document.querySelector('#domains-form')?.addEventListener('submit', saveDomains);
  document.querySelector('#path-form')?.addEventListener('submit', createPath);
  document.querySelector('#global-search')?.addEventListener('input', event => {
    const scope = event.target.dataset.searchScope;
    if (scope === 'templates') state.templateSearch = event.target.value; else state.search = event.target.value;
    const position = event.target.selectionStart;
    render();
    const input = document.querySelector('#global-search');
    input?.focus();
    input?.setSelectionRange(position, position);
  });
}

async function login(event) {
  event.preventDefault();
  const password = new FormData(event.currentTarget).get('password');
  try {
    await api('/api/auth/login', { method: 'POST', json: { password } });
    state.authenticated = true;
    state.dashboard = null;
    await loadBase();
    render();
  } catch (error) { toast(error.message, 'error'); }
}

async function createSite(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.published = form.elements.published.checked;
  try {
    setBusy('Creating website', 'Preparing the selected template and file structure.');
    const site = await api('/api/sites', { method: 'POST', json: data });
    state.modal = null;
    await loadBase();
    clearBusy();
    navigate(`site/${site.id}/overview`);
    toast(site.published ? 'Website created and published' : 'Draft website created');
  } catch (error) { clearBusy(); toast(error.message, 'error'); }
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.cors = form.elements.cors.checked;
  data.spa_fallback = form.elements.spa_fallback.checked;
  data.directory_listing = form.elements.directory_listing.checked;
  data.published = form.elements.published.checked;
  try {
    state.currentSite = await api(`/api/sites/${state.currentSite.id}`, { method: 'PATCH', json: data });
    await loadBase();
    render();
    toast('Settings saved');
  } catch (error) { toast(error.message, 'error'); }
}

async function saveDomains(event) {
  event.preventDefault();
  const domains = new FormData(event.currentTarget).get('domains').split(/\r?\n|,/).map(v => v.trim()).filter(Boolean);
  try {
    state.currentSite = await api(`/api/sites/${state.currentSite.id}`, { method: 'PATCH', json: { domains } });
    await loadBase();
    render();
    toast('Domains saved');
  } catch (error) { toast(error.message, 'error'); }
}

async function createPath(event) {
  event.preventDefault();
  const path = String(new FormData(event.currentTarget).get('path') || '').trim();
  const kind = event.currentTarget.dataset.kind;
  if (!path) return;
  try {
    if (kind === 'file') await api(`/api/sites/${state.currentSite.id}/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: new TextEncoder().encode('') });
    else await api(`/api/sites/${state.currentSite.id}/directory`, { method: 'POST', json: { path } });
    state.modal = null;
    state.files = await api(`/api/sites/${state.currentSite.id}/files`);
    render();
    toast(`${kind === 'file' ? 'File' : 'Folder'} created`);
  } catch (error) { toast(error.message, 'error'); }
}

async function openFile(path) {
  try {
    const result = await api(`/api/sites/${state.currentSite.id}/file?path=${encodeURIComponent(path)}`);
    state.currentFile = result;
    state.editorContent = result.content;
    render();
  } catch (error) { toast(error.message, 'error'); }
}

async function saveFile() {
  const editor = document.querySelector('#editor');
  if (!editor || !state.currentFile) return;
  try {
    await api(`/api/sites/${state.currentSite.id}/file?path=${encodeURIComponent(state.currentFile.path)}`, { method: 'PUT', body: new TextEncoder().encode(editor.value), headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    state.editorContent = editor.value;
    state.files = await api(`/api/sites/${state.currentSite.id}/files`);
    state.currentSite = await api(`/api/sites/${state.currentSite.id}`);
    toast('File saved');
  } catch (error) { toast(error.message, 'error'); }
}

async function uploadFiles(files, useRelativePath = false) {
  if (!state.currentSite || !files.length) return;
  state.modal = null;
  setBusy(`Uploading ${files.length} ${files.length === 1 ? 'file' : 'files'}`, 'Files are being copied to your Umbrel.');
  try {
    for (const file of files) {
      const destination = useRelativePath && file.webkitRelativePath ? file.webkitRelativePath : file.name;
      await api(`/api/sites/${state.currentSite.id}/upload-file?path=${encodeURIComponent(destination)}`, { method: 'POST', body: file });
    }
    state.files = await api(`/api/sites/${state.currentSite.id}/files`);
    state.currentSite = await api(`/api/sites/${state.currentSite.id}`);
    await loadBase();
    clearBusy();
    render();
    toast('Upload complete');
  } catch (error) { clearBusy(); toast(error.message, 'error'); }
  fileUpload.value = '';
  folderUpload.value = '';
}

async function importZip(file, createNew = false) {
  if (!file) return;
  try {
    let site = state.currentSite;
    if (createNew || !site) {
      const name = file.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported website';
      setBusy('Creating imported website', 'Preparing a new home for your files.');
      site = await api('/api/sites', { method: 'POST', json: { name, slug: name, template: 'blank' } });
    } else {
      setBusy('Importing ZIP archive', 'The current website files will be replaced.');
    }
    await api(`/api/sites/${site.id}/import-zip`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/zip' } });
    await loadBase();
    clearBusy();
    state.modal = null;
    navigate(`site/${site.id}/overview`);
    toast('ZIP archive imported');
  } catch (error) { clearBusy(); toast(error.message, 'error'); }
  zipUpload.value = '';
  delete zipUpload.dataset.createNew;
}

async function createBackup() {
  try {
    setBusy('Creating backup', 'Compressing the current website files.');
    await api(`/api/sites/${state.currentSite.id}/backups`, { method: 'POST' });
    state.backups = await api(`/api/sites/${state.currentSite.id}/backups`);
    await loadBase();
    clearBusy();
    render();
    toast('Backup created');
  } catch (error) { clearBusy(); toast(error.message, 'error'); }
}

async function duplicateSite() {
  try {
    setBusy('Duplicating website', 'Copying files and website settings.');
    const duplicate = await api(`/api/sites/${state.currentSite.id}/duplicate`, { method: 'POST', json: {} });
    await loadBase();
    clearBusy();
    navigate(`site/${duplicate.id}/overview`);
    toast('Website duplicated');
  } catch (error) { clearBusy(); toast(error.message, 'error'); }
}

async function updateIndependentOnion(action) {
  if (!state.currentSite) return;
  const labels = { generate: 'Generating Onion address', enable: 'Enabling Onion address', disable: 'Disabling Onion address', regenerate: 'Generating a new Onion address' };
  try {
    setBusy(labels[action] || 'Updating Onion address', action === 'regenerate' ? 'The previous address will stop working after the new identity is created.' : 'Pages is communicating with its private Tor service.');
    state.currentSite = await api(`/api/sites/${state.currentSite.id}/onion`, { method: 'POST', json: { action } });
    await loadBase();
    clearBusy();
    render();
    const messages = { generate: 'Independent Onion address created', enable: 'Independent Onion address enabled', disable: 'Independent Onion address disabled', regenerate: 'New independent Onion address created' };
    toast(messages[action] || 'Onion address updated');
  } catch (error) {
    clearBusy();
    state.currentSite = await api(`/api/sites/${state.currentSite.id}`).catch(() => state.currentSite);
    render();
    toast(error.message, 'error');
  }
}

async function performConfirmed(action) {
  state.modal = null;
  if (action === 'delete-site') {
    try {
      setBusy('Deleting website', 'Removing files, settings and backups.');
      await api(`/api/sites/${state.currentSite.id}`, { method: 'DELETE' });
      state.currentSite = null;
      await loadBase();
      clearBusy();
      navigate('sites');
      toast('Website deleted');
    } catch (error) { clearBusy(); toast(error.message, 'error'); }
  }
  if (action === 'regenerate-onion') {
    await updateIndependentOnion('regenerate');
  }
  if (action === 'delete-file') {
    try {
      await api(`/api/sites/${state.currentSite.id}/file?path=${encodeURIComponent(state.currentFile.path)}`, { method: 'DELETE' });
      state.currentFile = null;
      state.files = await api(`/api/sites/${state.currentSite.id}/files`);
      render();
      toast('File deleted');
    } catch (error) { toast(error.message, 'error'); }
  }
  if (action.startsWith('restore-backup:')) {
    const id = action.split(':')[1];
    try {
      setBusy('Restoring backup', 'Replacing the current website files.');
      await api(`/api/sites/${state.currentSite.id}/backups/${id}/restore`, { method: 'POST' });
      state.currentSite = await api(`/api/sites/${state.currentSite.id}`);
      clearBusy();
      render();
      toast('Backup restored');
    } catch (error) { clearBusy(); toast(error.message, 'error'); }
  }
  if (action.startsWith('delete-backup:')) {
    const id = action.split(':')[1];
    try {
      await api(`/api/sites/${state.currentSite.id}/backups/${id}`, { method: 'DELETE' });
      state.backups = await api(`/api/sites/${state.currentSite.id}/backups`);
      await loadBase();
      render();
      toast('Backup deleted');
    } catch (error) { toast(error.message, 'error'); }
  }
}

function openCreateModal(template = 'portfolio') { state.modal = { type: 'create', template }; render(); }
function openUploadModal() { state.modal = { type: 'upload' }; render(); }

app.addEventListener('click', async event => {
  const modalBackdrop = event.target.closest('[data-modal-backdrop]');
  if (modalBackdrop && event.target === modalBackdrop) {
    state.modal = null;
    render();
    return;
  }

  const copyButton = event.target.closest('[data-copy-url]');
  if (copyButton) { event.preventDefault(); event.stopPropagation(); await copyText(copyButton.dataset.copyUrl); return; }

  const qrButton = event.target.closest('[data-qr-url]');
  if (qrButton) {
    event.preventDefault();
    event.stopPropagation();
    state.modal = { type: 'qr', url: qrButton.dataset.qrUrl, title: qrButton.dataset.qrTitle || 'Website address' };
    render();
    return;
  }

  const category = event.target.closest('[data-template-category]')?.dataset.templateCategory;
  if (category) { state.templateCategory = category; render(); return; }

  const siteFilter = event.target.closest('[data-site-filter]')?.dataset.siteFilter;
  if (siteFilter) { state.siteFilter = siteFilter; render(); return; }

  const previewTemplate = event.target.closest('[data-preview-template]')?.dataset.previewTemplate;
  if (previewTemplate) { event.preventDefault(); event.stopPropagation(); state.modal = { type: 'template-preview', template: previewTemplate }; render(); return; }

  const useTemplate = event.target.closest('[data-use-template]')?.dataset.useTemplate;
  if (useTemplate) { event.preventDefault(); event.stopPropagation(); openCreateModal(useTemplate); return; }

  const nav = event.target.closest('[data-nav]')?.dataset.nav;
  if (nav) { state.sidebarOpen = false; navigate(nav); return; }

  const siteCard = event.target.closest('[data-open-site]');
  if (siteCard) { navigate(`site/${siteCard.dataset.openSite}/overview`); return; }

  const tab = event.target.closest('[data-site-tab]');
  if (tab) { navigate(`site/${tab.dataset.siteId}/${tab.dataset.siteTab}`); return; }

  const template = event.target.closest('[data-template]');
  if (template) {
    document.querySelectorAll('.template-card').forEach(card => card.classList.toggle('active', card === template));
    const templateId = template.dataset.template;
    const meta = state.templates.find(item => item.id === templateId);
    document.querySelector('#create-site-form [name="template"]').value = templateId;
    const iframe = document.querySelector('#create-template-iframe');
    if (iframe) iframe.src = templatePreviewUrl(templateId);
    const name = document.querySelector('#create-template-name'); if (name) name.textContent = meta?.name || templateId;
    const description = document.querySelector('#create-template-description'); if (description) description.textContent = meta?.description || '';
    return;
  }

  const openFileButton = event.target.closest('[data-open-file]');
  if (openFileButton) { await openFile(openFileButton.dataset.openFile); return; }

  const uploadChoice = event.target.closest('[data-upload-choice]')?.dataset.uploadChoice;
  if (uploadChoice === 'files') { fileUpload.click(); return; }
  if (uploadChoice === 'folder') { folderUpload.click(); return; }
  if (uploadChoice === 'zip') { delete zipUpload.dataset.createNew; zipUpload.click(); return; }

  const restore = event.target.closest('[data-restore-backup]')?.dataset.restoreBackup;
  if (restore) {
    state.modal = { type: 'confirm', action: `restore-backup:${restore}`, title: 'Restore this backup?', message: 'The current website files will be replaced by the selected backup.', label: 'Restore' };
    render(); return;
  }
  const deleteBackup = event.target.closest('[data-delete-backup]')?.dataset.deleteBackup;
  if (deleteBackup) {
    state.modal = { type: 'confirm', action: `delete-backup:${deleteBackup}`, title: 'Delete this backup?', message: 'This local snapshot will be permanently removed.', label: 'Delete' };
    render(); return;
  }

  const confirmed = event.target.closest('[data-confirm]')?.dataset.confirm;
  if (confirmed) { await performConfirmed(confirmed); return; }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'create-site') openCreateModal();
  if (action === 'close-modal') { state.modal = null; render(); }
  if (action === 'upload-menu') openUploadModal();
  if (action === 'show-sharing') navigate(`site/${state.currentSite.id}/domains`);
  if (action === 'browse-templates') { state.modal = null; navigate('templates'); }
  if (action === 'new-file') { state.modal = { type: 'prompt', kind: 'file' }; render(); }
  if (action === 'new-folder') { state.modal = { type: 'prompt', kind: 'folder' }; render(); }
  if (action === 'save-file') await saveFile();
  if (action === 'delete-file') { state.modal = { type: 'confirm', action: 'delete-file', title: 'Delete this file?', message: `/${state.currentFile.path} will be permanently removed.`, label: 'Delete' }; render(); }
  if (action === 'create-backup') await createBackup();
  if (action === 'duplicate-site') await duplicateSite();
  if (action === 'generate-onion') await updateIndependentOnion('generate');
  if (action === 'enable-onion') await updateIndependentOnion('enable');
  if (action === 'disable-onion') await updateIndependentOnion('disable');
  if (action === 'regenerate-onion') {
    state.modal = { type: 'confirm', action: 'regenerate-onion', title: 'Generate a new Onion address?', message: 'The current Onion address and its private identity will be permanently replaced. Existing links will stop working.', label: 'Regenerate address' };
    render();
  }
  if (action === 'toggle-publish') {
    try {
      state.currentSite = await api(`/api/sites/${state.currentSite.id}`, { method: 'PATCH', json: { published: !state.currentSite.published } });
      await loadBase(); render(); toast(state.currentSite.published ? 'Website published' : 'Website moved to drafts');
    } catch (error) { toast(error.message, 'error'); }
  }
  if (action === 'delete-site') { state.modal = { type: 'confirm', action: 'delete-site', title: `Delete ${state.currentSite.name}?`, message: 'All website files, domains, settings, local backups and any independent Onion identity will be permanently removed.', label: 'Delete website' }; render(); }
  if (action === 'import-zip') { delete zipUpload.dataset.createNew; zipUpload.click(); }
  if (action === 'import-new') { zipUpload.dataset.createNew = 'true'; zipUpload.click(); }
  if (action === 'theme') {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    localStorage.setItem('pages-theme', state.theme);
    render();
  }
  if (action === 'menu') { state.sidebarOpen = !state.sidebarOpen; render(); }
  if (action === 'logout') {
    await api('/api/auth/logout', { method: 'POST' });
    state.authenticated = false;
    state.dashboard = null;
    state.system = null;
    render();
  }
});

fileUpload.addEventListener('change', () => uploadFiles([...fileUpload.files]));
folderUpload.addEventListener('change', () => uploadFiles([...folderUpload.files], true));
zipUpload.addEventListener('change', () => importZip(zipUpload.files[0], zipUpload.dataset.createNew === 'true'));

window.addEventListener('hashchange', syncRoute);
window.addEventListener('scroll', () => document.querySelector('.topbar')?.classList.toggle('scrolled', scrollY > 5));
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && state.currentTab === 'files' && state.currentFile) {
    event.preventDefault();
    saveFile();
  }
  if (event.key === 'Escape' && state.modal) { state.modal = null; render(); }
});

async function init() {
  try {
    const status = await api('/api/auth/status');
    state.authenticated = status.authenticated;
    if (state.authenticated) await loadBase();
  } catch (error) { toast(error.message, 'error'); }
  state.loading = false;
  await syncRoute();
  render();
}

init();
