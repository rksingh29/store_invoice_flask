/* Store Invoice & PO Tracker - frontend (vanilla JavaScript, no frameworks) */
(function () {
  'use strict';

  // =====================================================================
  // DOM helpers
  // =====================================================================
  function h(tag, props) {
    const el = document.createElement(tag);
    setProps(el, props);
    append(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function setProps(el, props) {
    if (!props) return;
    Object.keys(props).forEach(function (k) {
      const v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
  }

  function append(el, children) {
    (Array.isArray(children) ? children : [children]).forEach(function add(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    append(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function field(label, control, opts) {
    opts = opts || {};
    return h('div', { class: 'field ' + (opts.cls || '') },
      h('label', null, label, opts.required ? h('span', { class: 'req' }, ' *') : null), control);
  }

  function selectEl(options, value, props, placeholder) {
    const sel = h('select', Object.assign({ class: 'input' }, props || {}),
      placeholder !== undefined ? h('option', { value: '' }, placeholder) : null,
      options.map(function (o) { return h('option', { value: o }, o); }));
    sel.value = value == null ? '' : value;
    return sel;
  }

  function td(label, content, cls) {
    return h('td', { 'data-label': label, class: cls || null }, content);
  }

  function debounce(fn, ms) {
    let t;
    return function () { const args = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, args); }, ms); };
  }

  // =====================================================================
  // Formatting & calculations (mirrors app.py)
  // =====================================================================
  const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfq = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
  const nfr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function money(v) { return isNum(v) ? (v < 0 ? '-₹' : '₹') + nf2.format(Math.abs(v)) : '—'; }
  function signedMoney(v) { return isNum(v) ? (v > 0 ? '+' : '') + money(v) : '—'; }
  function qty(v) { return isNum(v) ? nfq.format(v) : '—'; }
  function rateFmt(v) { return isNum(v) ? nfr.format(v) : '—'; }
  function signedRate(v) { return isNum(v) ? (v > 0 ? '+' : '') + nfr.format(v) : '—'; }
  function diffClass(v) { return !isNum(v) || Math.abs(v) < 0.005 ? '' : (v > 0 ? 'pos' : 'neg'); }
  function fmtDate(iso) { if (!iso) return ''; const p = iso.split('-'); return p[2] + '-' + p[1] + '-' + p[0]; }
  function isoOf(d) { const z = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function today() { return isoOf(new Date()); }
  function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); }
  function monthStart() { const d = new Date(); return isoOf(new Date(d.getFullYear(), d.getMonth(), 1)); }
  function compact(v) {
    const a = Math.abs(v);
    if (a >= 1e7) return '₹' + (v / 1e7).toFixed(a >= 1e8 ? 0 : 1) + 'Cr';
    if (a >= 1e5) return '₹' + (v / 1e5).toFixed(a >= 1e6 ? 0 : 1) + 'L';
    if (a >= 1e3) return '₹' + (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
    return '₹' + Math.round(v);
  }
  function r2(x) { return Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100) / 100; }

  /** '' -> null, junk -> NaN, else a number. */
  function toNum(v) {
    if (v === null || v === undefined) return null;
    const t = String(v).replace(/,/g, '').trim();
    if (t === '') return null;
    const n = Number(t);
    return isFinite(n) ? n : NaN;
  }

  function computeItem(it) {
    const tol = state.meta || { rate_tolerance: 0.005, amount_tolerance: 1 };
    const out = { without_gst: null, amount: null, gst_amount: null, rate_diff: null, amount_diff: null };
    const rate = it.rate, q = it.quantity, gst = isNum(it.gst) ? it.gst : 0;
    if (isNum(rate) && isNum(q)) {
      out.without_gst = r2(rate * q);
      out.amount = r2(rate * q * (1 + gst / 100));
      out.gst_amount = r2(out.amount - out.without_gst);
    }
    if (isNum(rate) && isNum(it.po_rate)) out.rate_diff = Math.round((rate - it.po_rate) * 10000) / 10000;
    if (isNum(out.amount) && isNum(it.po_amount)) out.amount_diff = r2(out.amount - it.po_amount);

    if (!it.particulars || !isNum(rate) || !isNum(q)) {
      out.po_status = 'Check Rate'; out.reason = 'Particulars, rate or quantity is missing';
    } else if (!(it.po_number || '').trim() || !isNum(it.po_rate)) {
      out.po_status = 'PO Pending'; out.reason = 'PO number or PO rate not entered yet';
    } else if (Math.abs(rate - it.po_rate) > tol.rate_tolerance) {
      out.po_status = 'Rate Mismatch'; out.reason = 'Invoice rate differs from PO rate by ' + signedRate(rate - it.po_rate);
    } else if (!isNum(it.po_amount)) {
      out.po_status = 'Check Rate'; out.reason = 'Rate matches but PO amount is missing';
    } else if (Math.abs(out.amount - it.po_amount) <= tol.amount_tolerance) {
      out.po_status = 'Matched'; out.reason = 'Rate and amount match the PO';
    } else if (Math.abs(out.without_gst - it.po_amount) <= tol.amount_tolerance) {
      out.po_status = 'Matched'; out.reason = 'Rate matches; PO amount matches the value before GST';
    } else {
      out.po_status = 'Check Rate'; out.reason = 'Rate matches but amount differs from PO amount by ' + signedMoney(out.amount - it.po_amount);
    }
    return out;
  }

  function invoiceStatus(statuses) {
    if (!statuses.length) return 'Check Rate';
    const order = ['Rate Mismatch', 'PO Pending', 'Check Rate'];
    for (let i = 0; i < order.length; i++) if (statuses.indexOf(order[i]) >= 0) return order[i];
    return 'Matched';
  }

  // =====================================================================
  // Badges
  // =====================================================================
  const PO_BADGE = { 'Matched': 'badge-matched', 'Rate Mismatch': 'badge-mismatch', 'PO Pending': 'badge-pending', 'Check Rate': 'badge-check' };
  const PAY_BADGE = { 'Paid': 'badge-paid', 'Partially Paid': 'badge-partial', 'Hold': 'badge-hold', 'Pending': 'badge-unpaid' };
  const STATUS_COLORS = { 'Matched': '#2e9e5b', 'Rate Mismatch': '#d9534f', 'PO Pending': '#e0a526', 'Check Rate': '#8a94a6' };

  function poBadge(status, title) { return h('span', { class: 'badge ' + (PO_BADGE[status] || 'badge-check'), title: title || null }, status); }
  function payBadge(status) { return h('span', { class: 'badge ' + (PAY_BADGE[status] || '') }, status); }
  function recvBadge(v) { return h('span', { class: 'badge ' + (v === 'Yes' ? 'badge-yes' : 'badge-no') }, v); }

  // =====================================================================
  // API
  // =====================================================================
  function qs(obj) {
    const p = new URLSearchParams();
    Object.keys(obj || {}).forEach(function (k) { if (obj[k] !== '' && obj[k] != null) p.append(k, obj[k]); });
    const str = p.toString();
    return str ? '?' + str : '';
  }

  async function api(path, opts) {
    opts = Object.assign({}, opts || {});
    opts.headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    if (opts.json !== undefined) {
      opts.body = JSON.stringify(opts.json);
      opts.headers['Content-Type'] = 'application/json';
      delete opts.json;
    }
    let res;
    try { res = await fetch(path, opts); }
    catch (e) { throw Object.assign(new Error('Cannot reach the server. Is the application running?'), { details: [] }); }
    let data = null;
    if ((res.headers.get('Content-Type') || '').indexOf('application/json') >= 0) data = await res.json().catch(function () { return null; });
    if (!res.ok) {
      const err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      err.details = (data && data.details) || [];
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function download(url, fallbackName) {
    let res;
    try { res = await fetch(url); }
    catch (e) { throw new Error('Cannot reach the server. Is the application running?'); }
    if (!res.ok) {
      const d = await res.json().catch(function () { return {}; });
      throw new Error(d.error || 'Download failed.');
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const a = h('a', { href: URL.createObjectURL(blob), download: m ? decodeURIComponent(m[1]) : fallbackName });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // =====================================================================
  // Toasts, modals, confirm
  // =====================================================================
  let toastBox;
  function toast(message, type, ms) {
    const t = h('div', { class: 'toast ' + (type || 'info'), role: 'status' },
      h('div', null, message),
      h('button', { class: 't-close', 'aria-label': 'Dismiss', onclick: function () { t.remove(); } }, '×'));
    toastBox.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || (type === 'error' ? 7000 : 3500));
  }

  const modalStack = [];
  function openModal(opts) {
    const m = {};
    const body = h('div', { class: 'modal-body' }, opts.body);
    const foot = opts.footer ? h('div', { class: 'modal-foot' }, opts.footer) : null;
    const titleEl = h('h3', null, opts.title);
    const box = h('div', { class: 'modal ' + (opts.size || ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' }, titleEl,
        h('button', { class: 'modal-close', 'aria-label': 'Close', title: 'Close', onclick: function () { m.close(); } }, '×')),
      body, foot);
    const backdrop = h('div', { class: 'modal-backdrop' }, box);
    backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop && !opts.sticky) m.close(); });
    m.el = box; m.body = body; m.titleEl = titleEl;
    m.close = async function (force) {
      if (!force && opts.closeGuard && !(await opts.closeGuard())) return;
      backdrop.remove();
      const i = modalStack.indexOf(m);
      if (i >= 0) modalStack.splice(i, 1);
      if (!modalStack.length) document.body.classList.remove('modal-open');
      if (opts.onClose) opts.onClose();
    };
    modalStack.push(m);
    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open');
    const first = box.querySelector('[autofocus]') || box.querySelector('.modal-body input, .modal-body select, .modal-foot .btn-primary');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return m;
  }

  function confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (v) { if (!done) { done = true; resolve(v); } };
      const ok = h('button', { class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'), onclick: function () { finish(true); m.close(true); } }, opts.okText || 'OK');
      const m = openModal({
        title: opts.title || 'Please confirm', size: '',
        body: h('p', { style: 'margin:0' }, message),
        footer: [h('button', { class: 'btn', onclick: function () { finish(false); m.close(true); } }, opts.cancelText || 'Cancel'), ok],
        onClose: function () { finish(false); }
      });
      setTimeout(function () { ok.focus(); }, 40);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalStack.length) { e.preventDefault(); modalStack[modalStack.length - 1].close(); }
  });

  function errorBox(err, intro) {
    const details = (err && err.details) || [];
    return h('div', { class: 'error-box', role: 'alert' },
      h('strong', null, intro || (err && err.message) || 'Something went wrong.'),
      details.length ? h('ul', null, details.map(function (d) { return h('li', null, d); })) : null);
  }

  // =====================================================================
  // State & shell
  // =====================================================================
  const EMPTY_FILTERS = { search: '', start_date: '', end_date: '', vendor: '', payment_status: '', po_status: '', invoice_received: '' };
  const state = {
    meta: null,
    vendors: [],
    view: 'dashboard',
    filters: Object.assign({}, EMPTY_FILTERS),
    dash: { start_date: monthStart(), end_date: today() }
  };
  let viewEl, navEl, vendorList;

  function renderShell() {
    const root = document.getElementById('app');
    clear(root);
    const items = [
      ['dashboard', 'Dashboard', function () { go('dashboard'); }],
      ['invoices', 'Invoices', function () { go('invoices'); }],
      ['add', '+ Add Invoice', function () { openInvoiceForm(); }],
      ['import', 'Import Excel', openImportDialog],
      ['export', 'Export Excel', exportExcel],
      ['template', 'Excel Template', downloadTemplate],
      ['scan', 'Scan Invoice', openScanDialog]
    ];
    navEl = h('nav', { class: 'nav', 'aria-label': 'Main' }, items.map(function (it) {
      return h('button', { dataset: { view: it[0] }, onclick: function () { navEl.classList.remove('open'); it[2](); } }, it[1]);
    }));
    vendorList = h('datalist', { id: 'dl-vendors' });
    root.appendChild(h('header', { class: 'topbar' },
      h('div', { class: 'topbar-inner' },
        h('div', { class: 'brand' }, h('div', { class: 'brand-logo' }, 'SI'), h('span', null, 'Store Invoice & PO Tracker')),
        h('button', { class: 'menu-toggle', 'aria-label': 'Menu', onclick: function () { navEl.classList.toggle('open'); } }, '☰'),
        navEl)));
    viewEl = h('main', { id: 'view' });
    toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' });
    root.appendChild(viewEl);
    root.appendChild(toastBox);
    root.appendChild(vendorList);
    root.appendChild(h('datalist', { id: 'dl-units' }, ((state.meta && state.meta.units) || []).map(function (u) { return h('option', { value: u }); })));
    root.appendChild(h('datalist', { id: 'dl-gst' }, [0, 5, 12, 18, 28].map(function (g) { return h('option', { value: g }); })));
  }

  function go(view) {
    if (location.hash !== '#/' + view) location.hash = '#/' + view;
    else route();
  }

  function route() {
    const view = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    state.view = view === 'invoices' ? 'invoices' : 'dashboard';
    Array.prototype.forEach.call(navEl.children, function (b) { b.classList.toggle('active', b.dataset.view === state.view); });
    if (state.view === 'invoices') renderInvoices(); else renderDashboard();
    window.scrollTo(0, 0);
  }

  function refreshView() { if (state.view === 'invoices') loadInvoices(); else loadDashboard(); }

  async function loadVendors() {
    try {
      const d = await api('/api/vendors');
      state.vendors = d.vendors;
      clear(vendorList);
      d.vendors.forEach(function (v) { vendorList.appendChild(h('option', { value: v })); });
    } catch (e) { /* non-critical */ }
  }

  // =====================================================================
  // Dashboard
  // =====================================================================
  let dashLoad = null;

  function renderDashboard() {
    clear(viewEl);
    const startIn = h('input', { type: 'date', class: 'input', value: state.dash.start_date });
    const endIn = h('input', { type: 'date', class: 'input', value: state.dash.end_date });
    const apply = function () {
      state.dash.start_date = startIn.value; state.dash.end_date = endIn.value;
      loadDashboard();
    };
    startIn.addEventListener('change', apply);
    endIn.addEventListener('change', apply);
    const quick = function (label, a, b) {
      return h('button', { class: 'btn btn-sm', onclick: function () { startIn.value = a; endIn.value = b; apply(); } }, label);
    };
    const d = new Date();
    const weekStart = addDays(-((d.getDay() + 6) % 7));

    const statsEl = h('div', { class: 'stats' });
    const chartsEl = h('div', { class: 'chart-grid' });
    const vendorEl = h('div', { class: 'panel' });
    const dailyEl = h('div', { class: 'panel' });
    append(viewEl, [
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, 'Dashboard'), h('p', null, 'Invoice vs Purchase Order summary for the selected dates')),
        h('div', { class: 'btn-group' },
          h('button', { class: 'btn btn-primary', onclick: function () { openInvoiceForm(); } }, '+ Add Invoice'),
          h('button', { class: 'btn', onclick: exportExcel }, 'Export Excel'))),
      h('div', { class: 'panel' },
        h('div', { class: 'dash-filters' },
          field('Start Date', startIn), field('End Date', endIn),
          h('div', { class: 'quick-range' },
            quick('Today', today(), today()),
            quick('Yesterday', addDays(-1), addDays(-1)),
            quick('This Week', weekStart, today()),
            quick('This Month', monthStart(), today()),
            quick('Last 30 Days', addDays(-29), today()),
            quick('All', '', '')))),
      statsEl, chartsEl, vendorEl, dailyEl
    ]);
    dashLoad = { statsEl: statsEl, chartsEl: chartsEl, vendorEl: vendorEl, dailyEl: dailyEl };
    loadDashboard();
  }

  let dashToken = 0;
  async function loadDashboard() {
    if (!dashLoad) return;
    const token = ++dashToken;
    const els = dashLoad;
    clear(els.statsEl).appendChild(h('div', { class: 'loading', style: 'grid-column:1/-1' }, h('span', { class: 'spinner' }), ' Loading…'));
    let d;
    try { d = await api('/api/dashboard' + qs(state.dash)); }
    catch (e) { if (token === dashToken) { clear(els.statsEl).appendChild(h('div', { style: 'grid-column:1/-1' }, errorBox(e))); toast(e.message, 'error'); } return; }
    if (token !== dashToken) return;
    paintDashboard(d, els);
  }

  function gotoInvoicesWith(extra) {
    state.filters = Object.assign({}, EMPTY_FILTERS, { start_date: state.dash.start_date, end_date: state.dash.end_date }, extra || {});
    go('invoices');
  }

  function paintDashboard(d, els) {
    const sm = d.summary;
    const card = function (label, value, sub, accent, onClick) {
      return h('div', { class: 'stat' + (onClick ? ' clickable' : ''), style: '--accent:' + accent, onclick: onClick || null, title: onClick ? 'Click to see these invoices' : null },
        h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub' }, sub) : null);
    };
    append(clear(els.statsEl), [
      card('Total Invoices', String(sm.total_invoices), sm.total_items + ' items · ' + sm.payment_pending + ' payment pending', '#1f4e78', function () { gotoInvoicesWith(); }),
      card('Total Invoice Value', money(sm.total_invoice_value), 'Before GST ' + money(sm.total_without_gst) + ' · GST ' + money(sm.total_gst), '#2d6aa3'),
      card('Total PO Value', money(sm.total_po_value), 'Sum of PO amounts entered', '#5b8fc7'),
      card('Total Difference', signedMoney(sm.total_difference), 'Invoice amount − PO amount (items with PO)', sm.total_difference > 0.5 ? '#c0392b' : '#1e7e45'),
      card('Matched Items', String(sm.matched_items), 'Rate & amount match PO', STATUS_COLORS['Matched'], function () { gotoInvoicesWith({ po_status: 'Matched' }); }),
      card('Rate Mismatch Items', String(sm.rate_mismatch_items), 'Invoice rate ≠ PO rate', STATUS_COLORS['Rate Mismatch'], function () { gotoInvoicesWith({ po_status: 'Rate Mismatch' }); }),
      card('PO Pending Items', String(sm.po_pending_items), sm.check_rate_items + ' item(s) need a rate check', STATUS_COLORS['PO Pending'], function () { gotoInvoicesWith({ po_status: 'PO Pending' }); }),
      card('Total Quantity', qty(sm.total_quantity), sm.not_received + ' invoice(s) not received', '#6b7a90')
    ]);

    append(clear(els.chartsEl), [
      h('div', { class: 'panel' }, h('h2', null, 'Invoice value vs PO value by date'), barChart(d.daily, chartWidth(els.chartsEl)),
        h('div', { class: 'chart-legend' }, h('span', { style: '--c:#2d6aa3' }, 'Invoice value'), h('span', { style: '--c:#9fc0e3' }, 'PO value'))),
      h('div', { class: 'panel' }, h('h2', null, 'Item PO status'), donutChart(d.status_counts))
    ]);

    const maxV = Math.max.apply(null, [1].concat(d.top_vendors.map(function (v) { return v.invoice_value; })));
    append(clear(els.vendorEl), [h('h2', null, 'Top vendors by invoice value'),
      d.top_vendors.length ? d.top_vendors.map(function (v) {
        return h('div', { class: 'hbar' },
          h('div', { class: 'name', title: v.vendor }, h('button', { class: 'link-btn', onclick: function () { gotoInvoicesWith({ vendor: v.vendor }); } }, v.vendor)),
          h('div', { class: 'track' }, h('div', { class: 'fill', style: 'width:' + Math.max(1, v.invoice_value / maxV * 100) + '%' })),
          h('div', { class: 'num' }, money(v.invoice_value), h('span', { class: 'muted small' }, ' (' + v.invoice_count + ')')));
      }) : h('div', { class: 'chart-empty' }, 'No data for this date range.')]);

    const tot = d.daily.reduce(function (a, r) {
      a.c += r.invoice_count; a.i += r.invoice_value; a.p += r.po_value; a.d += r.difference; return a;
    }, { c: 0, i: 0, p: 0, d: 0 });
    const rows = d.daily.slice().reverse().map(function (r) {
      return h('tr', null,
        td('Date', h('button', { class: 'link-btn', title: 'Show invoices of this date', onclick: function () { gotoInvoicesWith({ start_date: r.date, end_date: r.date }); } }, fmtDate(r.date))),
        td('Invoice Count', r.invoice_count, 'num'),
        td('Invoice Value', money(r.invoice_value), 'num'),
        td('PO Value', money(r.po_value), 'num'),
        td('Difference', h('span', { class: diffClass(r.difference) }, signedMoney(r.difference)), 'num'));
    });
    append(clear(els.dailyEl), [
      h('div', { class: 'panel-head' }, h('h2', null, 'Date-wise summary'), h('span', { class: 'muted small' }, 'Click a date to open its invoices')),
      h('div', { class: 'table-wrap cards' },
        h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', { class: 'num' }, 'Invoice Count'), h('th', { class: 'num' }, 'Invoice Value'), h('th', { class: 'num' }, 'PO Value'), h('th', { class: 'num' }, 'Difference'))),
          h('tbody', null, rows.length ? rows : h('tr', null, h('td', { class: 'empty', colspan: 5 }, 'No invoices in this date range.'))),
          rows.length ? h('tfoot', null, h('tr', null,
            td('Total', 'Total'), td('Invoice Count', tot.c, 'num'), td('Invoice Value', money(r2(tot.i)), 'num'),
            td('PO Value', money(r2(tot.p)), 'num'), td('Difference', signedMoney(r2(tot.d)), 'num'))) : null))
    ]);
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function chartWidth(grid) {
    const full = grid.clientWidth || 900;
    return Math.floor(window.innerWidth > 1000 ? (full - 16) * 2 / 3 - 34 : full - 34);
  }

  function barChart(daily, width) {
    if (!daily.length) return h('div', { class: 'chart-empty' }, 'No invoices in this date range.');
    const padL = 62, padR = 10, padT = 12, padB = 46, H = 280;
    const W = Math.max(width || 560, 300, daily.length * 54 + padL + padR);
    const plotH = H - padT - padB, plotW = W - padL - padR, band = plotW / daily.length;
    const bw = Math.max(4, Math.min(22, band * 0.34));
    const max = niceMax(Math.max(1, Math.max.apply(null, daily.map(function (d) { return Math.max(d.invoice_value, d.po_value); }))));
    const svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Invoice value and PO value by date' });
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH - plotH * i / 4;
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: '#e5e9ef' }));
      svg.appendChild(s('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#64748b' }, compact(max * i / 4)));
    }
    const every = Math.ceil(42 / band);
    daily.forEach(function (d, i) {
      const cx = padL + band * i + band / 2;
      const hi = plotH * d.invoice_value / max, hp = plotH * d.po_value / max;
      svg.appendChild(s('rect', { x: cx - bw - 1, y: padT + plotH - hi, width: bw, height: Math.max(0, hi), rx: 2, fill: '#2d6aa3' },
        s('title', null, fmtDate(d.date) + '\nInvoice value: ' + money(d.invoice_value) + '\nInvoices: ' + d.invoice_count)));
      svg.appendChild(s('rect', { x: cx + 1, y: padT + plotH - hp, width: bw, height: Math.max(0, hp), rx: 2, fill: '#9fc0e3' },
        s('title', null, fmtDate(d.date) + '\nPO value: ' + money(d.po_value) + '\nDifference: ' + signedMoney(d.difference))));
      if (i % every === 0) {
        svg.appendChild(s('text', { x: cx, y: H - padB + 18, 'text-anchor': 'middle', 'font-size': 11, fill: '#475569' }, fmtDate(d.date).slice(0, 5)));
        svg.appendChild(s('text', { x: cx, y: H - padB + 32, 'text-anchor': 'middle', 'font-size': 10, fill: '#94a3b8' }, d.date.slice(0, 4)));
      }
    });
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH, stroke: '#94a3b8' }));
    return h('div', { class: 'chart-wrap' }, svg);
  }

  function donutChart(counts) {
    const keys = Object.keys(STATUS_COLORS);
    const total = keys.reduce(function (a, k) { return a + (counts[k] || 0); }, 0);
    if (!total) return h('div', { class: 'chart-empty' }, 'No items in this date range.');
    const r = 62, C = 2 * Math.PI * r;
    const svg = s('svg', { width: 170, height: 170, viewBox: '0 0 170 170', role: 'img', 'aria-label': 'Item PO status' });
    svg.appendChild(s('circle', { cx: 85, cy: 85, r: r, fill: 'none', stroke: '#eef1f5', 'stroke-width': 24 }));
    let offset = 0;
    keys.forEach(function (k) {
      const n = counts[k] || 0;
      if (!n) return;
      const len = C * n / total;
      svg.appendChild(s('circle', {
        cx: 85, cy: 85, r: r, fill: 'none', stroke: STATUS_COLORS[k], 'stroke-width': 24,
        'stroke-dasharray': len + ' ' + (C - len), 'stroke-dashoffset': -offset, transform: 'rotate(-90 85 85)'
      }, s('title', null, k + ': ' + n)));
      offset += len;
    });
    svg.appendChild(s('text', { x: 85, y: 84, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700, fill: '#1d2733' }, total));
    svg.appendChild(s('text', { x: 85, y: 103, 'text-anchor': 'middle', 'font-size': 12, fill: '#64748b' }, 'items'));
    return h('div', { class: 'donut-box' }, svg,
      h('div', { class: 'donut-legend' }, keys.map(function (k) {
        const n = counts[k] || 0;
        return h('div', null, h('i', { style: 'background:' + STATUS_COLORS[k] }), h('span', null, k), h('strong', { style: 'margin-left:auto;padding-left:12px' }, n + ' (' + Math.round(n / total * 100) + '%)'));
      })));
  }

  // =====================================================================
  // Invoice list
  // =====================================================================
  let listEls = null;

  function renderInvoices() {
    clear(viewEl);
    const meta = state.meta;
    const f = state.filters;
    const searchIn = h('input', { type: 'search', class: 'input', placeholder: 'Invoice no., vendor, item, PO no.…', value: f.search });
    const startIn = h('input', { type: 'date', class: 'input', value: f.start_date });
    const endIn = h('input', { type: 'date', class: 'input', value: f.end_date });
    const vendorSel = selectEl(state.vendors.indexOf(f.vendor) >= 0 || !f.vendor ? state.vendors : state.vendors.concat([f.vendor]), f.vendor, null, 'All vendors');
    const paySel = selectEl(meta.payment_statuses, f.payment_status, null, 'All');
    const poSel = selectEl(meta.po_statuses, f.po_status, null, 'All');
    const recvSel = selectEl(meta.received_options, f.invoice_received, null, 'All');

    const read = function () {
      Object.assign(state.filters, {
        search: searchIn.value.trim(), start_date: startIn.value, end_date: endIn.value, vendor: vendorSel.value,
        payment_status: paySel.value, po_status: poSel.value, invoice_received: recvSel.value
      });
      loadInvoices();
    };
    searchIn.addEventListener('input', debounce(read, 300));
    [startIn, endIn, vendorSel, paySel, poSel, recvSel].forEach(function (el) { el.addEventListener('change', read); });

    const summaryEl = h('span', { class: 'muted' });
    const tableBox = h('div', { class: 'table-wrap cards' });
    append(viewEl, [
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, 'Invoices'), h('p', null, 'Search, filter and manage vendor invoices')),
        h('div', { class: 'btn-group' },
          h('button', { class: 'btn btn-primary', onclick: function () { openInvoiceForm(); } }, '+ Add Invoice'),
          h('button', { class: 'btn', onclick: exportExcel }, 'Export Excel'))),
      h('div', { class: 'panel' },
        h('div', { class: 'filters' },
          field('Search', searchIn, { cls: 'search-field' }),
          field('Start Date', startIn), field('End Date', endIn), field('Vendor', vendorSel),
          field('Payment Status', paySel), field('PO Status', poSel), field('Invoice Received', recvSel),
          h('button', { class: 'btn', onclick: function () { state.filters = Object.assign({}, EMPTY_FILTERS); renderInvoices(); } }, 'Clear'))),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Invoice list'), summaryEl),
        tableBox)
    ]);
    listEls = { summaryEl: summaryEl, tableBox: tableBox };
    loadInvoices();
  }

  let listToken = 0;
  async function loadInvoices() {
    if (!listEls) return;
    const token = ++listToken;
    const els = listEls;
    clear(els.tableBox).appendChild(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), ' Loading…'));
    let d;
    try { d = await api('/api/invoices' + qs(state.filters)); }
    catch (e) { if (token === listToken) { clear(els.tableBox).appendChild(errorBox(e)); toast(e.message, 'error'); } return; }
    if (token !== listToken) return;

    els.summaryEl.textContent = d.count + ' invoice(s) · Invoice ' + money(d.totals.amount) + ' · PO ' + money(d.totals.po_amount) + ' · Difference ' + signedMoney(d.totals.difference);
    const headers = ['SL No.', 'Date', 'Invoice No.', 'Vendor', 'Items', 'Invoice Amount', 'PO Amount', 'Difference', 'PO Status', 'Payment Status', 'Invoice Received', 'Actions'];
    const numCols = { 'Items': 1, 'Invoice Amount': 1, 'PO Amount': 1, 'Difference': 1 };
    const rows = d.invoices.map(function (inv) {
      const counts = inv.status_counts;
      const tip = Object.keys(counts).filter(function (k) { return counts[k]; }).map(function (k) { return k + ': ' + counts[k]; }).join(', ');
      return h('tr', null,
        td('SL No.', inv.sl_no),
        td('Date', fmtDate(inv.invoice_date)),
        td('Invoice No.', h('button', { class: 'link-btn', onclick: function () { viewInvoice(inv.id); } }, inv.invoice_no)),
        td('Vendor', inv.vendor_name),
        td('Items', inv.totals.item_count, 'num'),
        td('Invoice Amount', money(inv.totals.amount), 'num'),
        td('PO Amount', money(inv.totals.po_amount), 'num'),
        td('Difference', h('span', { class: diffClass(inv.totals.difference) }, signedMoney(inv.totals.difference)), 'num'),
        td('PO Status', poBadge(inv.po_status, tip)),
        td('Payment Status', payBadge(inv.payment_status)),
        td('Invoice Received', recvBadge(inv.invoice_received)),
        h('td', { class: 'actions no-label' },
          h('button', { class: 'btn btn-sm btn-ghost', onclick: function () { viewInvoice(inv.id); } }, 'View'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: function () { editInvoice(inv.id); } }, 'Edit'),
          h('button', { class: 'btn btn-sm btn-ghost pos', onclick: function () { deleteInvoice(inv); } }, 'Delete')));
    });
    append(clear(els.tableBox), h('table', { class: 'data' },
      h('thead', null, h('tr', null, headers.map(function (t) { return h('th', { class: numCols[t] ? 'num' : (t === 'Actions' ? 'actions' : null) }, t); }))),
      h('tbody', null, rows.length ? rows : h('tr', null, h('td', { class: 'empty', colspan: headers.length },
        'No invoices found. ', h('button', { class: 'link-btn', onclick: function () { openInvoiceForm(); } }, 'Add an invoice'), ' or change the filters.')))));
  }

  async function viewInvoice(id) {
    let inv;
    try { inv = await api('/api/invoices/' + id); } catch (e) { toast(e.message, 'error'); return; }
    const kv = function (k, v) { return h('div', null, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)); };
    const t = inv.totals;
    const cols = ['#', 'Particulars', 'HSN', 'Rate', 'Qty', 'Unit', 'GST %', 'Without GST', 'Amount', 'PO Date', 'PO Number', 'PO Rate', 'PO Amount', 'Rate Diff', 'Amount Diff', 'PO Status'];
    const numCols = ['Rate', 'Qty', 'GST %', 'Without GST', 'Amount', 'PO Rate', 'PO Amount', 'Rate Diff', 'Amount Diff'];
    const m = openModal({
      title: 'Invoice ' + inv.invoice_no, size: 'xl',
      body: [
        h('div', { class: 'detail-grid' },
          kv('Invoice Date', fmtDate(inv.invoice_date)), kv('Invoice No.', inv.invoice_no), kv('Vendor Name', inv.vendor_name),
          kv('Invoice Type', inv.invoice_type), kv('Payment Status', payBadge(inv.payment_status)),
          kv('Invoice Received', recvBadge(inv.invoice_received)), kv('PO Status', poBadge(inv.po_status)),
          kv('Remarks', inv.remarks || '—')),
        h('div', { class: 'section-title' }, 'Items (' + inv.items.length + ')'),
        h('div', { class: 'table-wrap cards' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: numCols.indexOf(c) >= 0 ? 'num' : null }, c); }))),
          h('tbody', null, inv.items.map(function (it, i) {
            return h('tr', null,
              td('#', i + 1), td('Particulars', it.particulars), td('HSN', it.hsn || '—'),
              td('Rate', rateFmt(it.rate), 'num'), td('Qty', qty(it.quantity), 'num'), td('Unit', it.unit || '—'),
              td('GST %', qty(it.gst), 'num'), td('Without GST', money(it.without_gst), 'num'), td('Amount', money(it.amount), 'num'),
              td('PO Date', fmtDate(it.po_date) || '—'), td('PO Number', it.po_number || '—'),
              td('PO Rate', rateFmt(it.po_rate), 'num'), td('PO Amount', money(it.po_amount), 'num'),
              td('Rate Diff', h('span', { class: diffClass(it.rate_diff) }, signedRate(it.rate_diff)), 'num'),
              td('Amount Diff', h('span', { class: diffClass(it.amount_diff) }, signedMoney(it.amount_diff)), 'num'),
              td('PO Status', poBadge(it.po_status, it.po_status_reason)));
          })))),
        totalsBox(t),
        h('p', { class: 'muted small' }, 'Created ' + inv.created_at + ' · Last updated ' + inv.updated_at)
      ],
      footer: [
        h('button', { class: 'btn btn-danger', onclick: async function () { if (await deleteInvoice(inv)) m.close(true); } }, 'Delete'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: function () { m.close(); } }, 'Close'),
        h('button', { class: 'btn btn-primary', onclick: function () { m.close(true); openInvoiceForm(inv); } }, 'Edit')
      ]
    });
  }

  function totalsBox(t) {
    const cell = function (label, value, cls) { return h('div', { class: cls || null }, h('span', null, label), h('strong', null, value)); };
    return h('div', { class: 'totals-box' },
      cell('Items / Qty', t.item_count + ' / ' + qty(t.quantity)),
      cell('Without GST', money(t.without_gst)),
      cell('GST Amount', money(t.gst_amount)),
      cell('Invoice Total', money(t.amount), 'grand'),
      cell('PO Total', money(t.po_amount)),
      cell('Difference', signedMoney(t.difference)));
  }

  async function editInvoice(id) {
    try { openInvoiceForm(await api('/api/invoices/' + id)); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function deleteInvoice(inv) {
    const ok = await confirmDialog('Delete invoice "' + inv.invoice_no + '" from ' + inv.vendor_name + ' (' + fmtDate(inv.invoice_date) + ')? All its items will also be deleted. This cannot be undone.',
      { title: 'Delete invoice', okText: 'Delete', danger: true });
    if (!ok) return false;
    try {
      await api('/api/invoices/' + inv.id, { method: 'DELETE' });
      toast('Invoice ' + inv.invoice_no + ' deleted.', 'success');
      loadVendors();
      refreshView();
      return true;
    } catch (e) { toast(e.message, 'error'); return false; }
  }

  // =====================================================================
  // Add / Edit invoice form
  // =====================================================================
  const ITEM_FIELDS = [
    // key, label, input type, css class, numeric
    ['particulars', 'Particulars', 'text', 'col-part', false],
    ['hsn', 'HSN', 'text', 'col-md', false],
    ['rate', 'Rate', 'number', 'col-md', true],
    ['quantity', 'Quantity', 'number', 'col-md', true],
    ['unit', 'Unit', 'text', 'col-sm', false],
    ['gst', 'GST %', 'number', 'col-sm', true],
    ['without_gst', 'Without GST', 'calc'],
    ['amount', 'Amount', 'calc'],
    ['po_date', 'PO Date', 'date', 'col-date', false],
    ['po_number', 'PO Number', 'text', 'col-md', false],
    ['po_rate', 'PO Rate', 'number', 'col-md', true],
    ['po_amount', 'PO Amount', 'number', 'col-md', true]
  ];

  function openInvoiceForm(invoice, opts) {
    opts = opts || {};
    const meta = state.meta;
    const editing = !!(invoice && invoice.id);
    const ocr = opts.ocr || null;
    const flags = (ocr && ocr.headerFlags) || {};
    const src = invoice || {};
    let dirty = !!ocr;

    const mkInput = function (key, props) {
      const el = h('input', Object.assign({ class: 'input' + (flags[key] ? ' ocr-flag' : ''), name: key }, props));
      el.addEventListener('input', function () { dirty = true; el.classList.remove('invalid', 'ocr-flag'); });
      return el;
    };
    const mkSelect = function (key, options, value) {
      const el = selectEl(options, value, { name: key });
      el.addEventListener('change', function () { dirty = true; });
      return el;
    };
    const hdr = {
      invoice_date: mkInput('invoice_date', { type: 'date', value: src.invoice_date || today(), required: true }),
      invoice_no: mkInput('invoice_no', { type: 'text', value: src.invoice_no || '', placeholder: 'e.g. INV1001', maxlength: 60, autofocus: !editing && !ocr }),
      vendor_name: mkInput('vendor_name', { type: 'text', value: src.vendor_name || '', placeholder: 'Vendor / supplier name', list: 'dl-vendors', maxlength: 150, autocomplete: 'off' }),
      invoice_type: mkSelect('invoice_type', meta.invoice_types, src.invoice_type || 'Purchase'),
      payment_status: mkSelect('payment_status', meta.payment_statuses, src.payment_status || 'Pending'),
      invoice_received: mkSelect('invoice_received', meta.received_options, src.invoice_received || 'Yes'),
      remarks: h('textarea', { class: 'input', name: 'remarks', rows: 1, maxlength: 1000, placeholder: 'Optional notes' }, src.remarks || '')
    };
    hdr.remarks.addEventListener('input', function () { dirty = true; });

    const rows = [];
    const tbody = h('tbody');
    const totalsEl = h('div');
    const errorEl = h('div');
    const ocrTotalEl = h('strong');

    function addRow(data, rowFlags, focus) {
      data = data || {};
      rowFlags = rowFlags || {};
      const row = { inputs: {}, cells: {} };
      const tr = h('tr');
      row.tr = tr;
      row.noCell = h('td', { class: 'row-no' });
      tr.appendChild(row.noCell);
      ITEM_FIELDS.forEach(function (f) {
        const key = f[0], label = f[1], type = f[2];
        if (type === 'calc') {
          row.cells[key] = h('td', { class: 'calc num', 'data-label': label }, '—');
          tr.appendChild(row.cells[key]);
          return;
        }
        const props = { type: type, class: 'input' + (rowFlags[key] ? ' ocr-flag' : ''), 'aria-label': label };
        if (type === 'number') Object.assign(props, { step: 'any', min: '0', inputmode: 'decimal' });
        if (key === 'unit') Object.assign(props, { list: 'dl-units', autocomplete: 'off' });
        if (key === 'gst') Object.assign(props, { list: 'dl-gst', placeholder: '0' });
        if (key === 'particulars') Object.assign(props, { placeholder: 'Item name', maxlength: 250 });
        const v = data[key];
        props.value = v === null || v === undefined ? '' : v;
        const inp = h('input', props);
        inp.addEventListener('input', function () {
          dirty = true;
          inp.classList.remove('invalid', 'ocr-flag');
          recalcRow(row);
          recalcTotals();
        });
        row.inputs[key] = inp;
        tr.appendChild(h('td', { class: f[3], 'data-label': label }, inp));
      });
      row.statusCell = h('td', { class: 'status-cell', 'data-label': 'PO Status' });
      tr.appendChild(row.statusCell);
      tr.appendChild(h('td', { class: 'no-label', 'data-label': '' },
        h('button', { class: 'btn btn-sm btn-ghost pos', type: 'button', title: 'Remove this item', 'aria-label': 'Remove item', onclick: function () { removeRow(row); } }, '✕ Remove')));
      rows.push(row);
      tbody.appendChild(tr);
      renumber();
      recalcRow(row);
      if (focus) row.inputs.particulars.focus();
      return row;
    }

    function removeRow(row) {
      if (rows.length === 1) { toast('An invoice needs at least one item.', 'warn'); return; }
      rows.splice(rows.indexOf(row), 1);
      row.tr.remove();
      dirty = true;
      renumber();
      recalcTotals();
    }

    function renumber() { rows.forEach(function (r, i) { r.noCell.textContent = '#' + (i + 1); }); }

    function readRow(row) {
      const it = {};
      ITEM_FIELDS.forEach(function (f) {
        const inp = row.inputs[f[0]];
        if (!inp) return;
        if (f[4]) it[f[0]] = inp.validity && inp.validity.badInput ? NaN : toNum(inp.value);
        else it[f[0]] = inp.value.trim();
      });
      return it;
    }

    function recalcRow(row) {
      const it = readRow(row);
      const c = computeItem(it);
      row.calc = c;
      row.cells.without_gst.textContent = money(c.without_gst);
      row.cells.amount.textContent = money(c.amount);
      const diffs = [];
      if (isNum(c.rate_diff)) diffs.push('Rate ' + signedRate(c.rate_diff));
      if (isNum(c.amount_diff)) diffs.push('Amt ' + signedMoney(c.amount_diff));
      append(clear(row.statusCell), [poBadge(c.po_status, c.reason), diffs.length ? h('div', { class: 'diff' }, diffs.join(' · ')) : null]);
    }

    function recalcTotals() {
      const t = { item_count: rows.length, quantity: 0, without_gst: 0, gst_amount: 0, amount: 0, po_amount: 0, difference: 0 };
      const statuses = [];
      rows.forEach(function (r) {
        const it = readRow(r), c = r.calc;
        if (isNum(it.quantity)) t.quantity += it.quantity;
        if (isNum(c.without_gst)) t.without_gst += c.without_gst;
        if (isNum(c.gst_amount)) t.gst_amount += c.gst_amount;
        if (isNum(c.amount)) t.amount += c.amount;
        if (isNum(it.po_amount)) t.po_amount += it.po_amount;
        if (isNum(c.amount_diff)) t.difference += c.amount_diff;
        statuses.push(c.po_status);
      });
      ['without_gst', 'gst_amount', 'amount', 'po_amount', 'difference'].forEach(function (k) { t[k] = r2(t[k]); });
      append(clear(totalsEl), [
        h('div', { class: 'section-title' }, h('span', null, 'Invoice totals'), h('span', null, 'Invoice PO status: ', poBadge(invoiceStatus(statuses)))),
        totalsBox(t)
      ]);
      if (ocr && isNum(ocr.invoice_amount)) {
        const diff = r2(t.amount - ocr.invoice_amount);
        ocrTotalEl.textContent = 'Total read from image: ' + money(ocr.invoice_amount) + ' · Calculated total: ' + money(t.amount) +
          (Math.abs(diff) > 1 ? ' · Difference ' + signedMoney(diff) + ' — please check the items.' : ' · Totals agree.');
      }
    }

    // Initial rows
    const initialItems = (src.items && src.items.length) ? src.items : [{}];
    initialItems.forEach(function (it, i) { addRow(it, (ocr && ocr.itemFlags && ocr.itemFlags[i]) || {}); });
    recalcTotals();

    const addBtn = h('button', {
      class: 'btn btn-sm btn-primary', type: 'button', onclick: function () {
        const last = rows.length ? readRow(rows[rows.length - 1]) : {};
        addRow({ gst: isNum(last.gst) ? last.gst : '', unit: last.unit || '', po_date: last.po_date || '' }, {}, true);
        recalcTotals();
        dirty = true;
      }
    }, '+ Add Item');

    const ocrBanner = ocr ? h('div', { class: 'ocr-banner' },
      h('strong', null, '⚠ Scanned by OCR (' + ocr.provider + ') — please verify. '),
      'Fields with a ', h('span', { class: 'badge badge-ocr' }, 'yellow background'),
      ' were filled automatically and may contain mistakes. Check every value against the paper invoice, fill in missing data (e.g. PO details), then click Save. Nothing is saved until you click Save.',
      h('div', { style: 'margin-top:6px' }, ocrTotalEl),
      ocr.raw_text ? h('details', null, h('summary', null, 'Show text read from the image'), h('pre', null, ocr.raw_text)) : null) : null;

    const saveBtn = h('button', { class: 'btn btn-success', type: 'button', onclick: save }, editing ? 'Save Changes' : 'Save Invoice');

    const m = openModal({
      title: editing ? 'Edit Invoice ' + src.invoice_no : (ocr ? 'New Invoice from Scan' : 'Add Invoice'),
      size: 'xl', sticky: true,
      closeGuard: async function () {
        if (!dirty) return true;
        return confirmDialog('You have unsaved changes. Close without saving?', { title: 'Discard changes?', okText: 'Discard', danger: true });
      },
      body: [
        ocrBanner, errorEl,
        h('div', { class: 'section-title' }, 'Invoice details'),
        h('div', { class: 'form-grid' },
          field('Invoice Date', hdr.invoice_date, { required: true }),
          field('Invoice No.', hdr.invoice_no, { required: true }),
          field('Vendor Name', hdr.vendor_name, { required: true, cls: 'span-2' }),
          field('Invoice Type', hdr.invoice_type),
          field('Payment Status', hdr.payment_status),
          field('Invoice Received', hdr.invoice_received),
          field('Remarks', hdr.remarks)),
        h('div', { class: 'section-title' }, h('span', null, 'Items'), addBtn),
        h('div', { class: 'table-wrap cards' }, h('table', { class: 'data items' },
          h('thead', null, h('tr', null, h('th', null, '#'),
            ITEM_FIELDS.map(function (f) {
              return h('th', { class: f[2] === 'calc' ? 'num' : null }, f[1], f[0] === 'particulars' || f[0] === 'rate' || f[0] === 'quantity' ? h('span', { class: 'pos' }, ' *') : null);
            }),
            h('th', null, 'PO Status'), h('th', null, 'Remove'))),
          tbody)),
        h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: function () { addBtn.click(); } }, '+ Add Item')),
        totalsEl,
        h('p', { class: 'muted small' }, 'Without GST = Rate × Quantity · Amount = Rate × Quantity × (1 + GST% / 100) · Differences = Invoice − PO.')
      ],
      footer: [
        h('span', { class: 'muted small', style: 'margin-right:auto;align-self:center' }, h('span', { class: 'pos' }, '*'), ' required'),
        h('button', { class: 'btn', type: 'button', onclick: function () { m.close(); } }, 'Cancel'),
        saveBtn
      ]
    });
    recalcTotals();

    function validate() {
      const errors = [];
      m.el.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
      const bad = function (el, msg) { el.classList.add('invalid'); errors.push(msg); };
      if (!hdr.invoice_date.value) bad(hdr.invoice_date, 'Invoice Date is required.');
      if (!hdr.invoice_no.value.trim()) bad(hdr.invoice_no, 'Invoice No. is required.');
      if (!hdr.vendor_name.value.trim()) bad(hdr.vendor_name, 'Vendor Name is required.');
      if (!rows.length) errors.push('Add at least one item.');
      rows.forEach(function (r, i) {
        const it = readRow(r), n = 'Item ' + (i + 1) + ': ';
        if (!it.particulars) bad(r.inputs.particulars, n + 'Particulars is required.');
        [['rate', 'Rate', true], ['quantity', 'Quantity', true], ['gst', 'GST %', false], ['po_rate', 'PO Rate', false], ['po_amount', 'PO Amount', false]].forEach(function (f) {
          const v = it[f[0]];
          if (v === null) { if (f[2]) bad(r.inputs[f[0]], n + f[1] + ' is required.'); }
          else if (!isNum(v)) bad(r.inputs[f[0]], n + f[1] + ' must be a number.');
          else if (v < 0) bad(r.inputs[f[0]], n + f[1] + ' cannot be negative.');
        });
        if (isNum(it.gst) && it.gst > 100) bad(r.inputs.gst, n + 'GST % cannot be more than 100.');
      });
      return errors;
    }

    async function save() {
      clear(errorEl);
      const errors = validate();
      if (errors.length) {
        errorEl.appendChild(errorBox({ details: errors }, 'Please correct the following:'));
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const firstBad = m.el.querySelector('.invalid');
        if (firstBad) firstBad.focus();
        toast('Please correct the highlighted fields.', 'error');
        return;
      }
      const payload = {
        invoice_date: hdr.invoice_date.value,
        invoice_no: hdr.invoice_no.value.trim(),
        vendor_name: hdr.vendor_name.value.trim(),
        invoice_type: hdr.invoice_type.value,
        payment_status: hdr.payment_status.value,
        invoice_received: hdr.invoice_received.value,
        remarks: hdr.remarks.value.trim(),
        items: rows.map(function (r) {
          const it = readRow(r);
          delete it.without_gst; delete it.amount;
          return it;
        })
      };
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        const saved = await api(editing ? '/api/invoices/' + src.id : '/api/invoices', { method: editing ? 'PUT' : 'POST', json: payload });
        toast('Invoice ' + saved.invoice_no + (editing ? ' updated.' : ' saved with ' + saved.items.length + ' item(s).'), 'success');
        m.close(true);
        loadVendors();
        refreshView();
      } catch (e) {
        errorEl.appendChild(errorBox(e));
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        toast(e.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = editing ? 'Save Changes' : 'Save Invoice';
      }
    }
  }

  // =====================================================================
  // Excel import / export / template
  // =====================================================================
  function dropzone(accept, hint, onFile) {
    const input = h('input', { type: 'file', accept: accept });
    const label = h('div', { class: 'muted small' }, hint);
    const zone = h('label', { class: 'dropzone' }, input, h('div', { class: 'big' }, 'Click to choose a file'), h('div', { class: 'muted' }, 'or drag and drop it here'), label);
    input.addEventListener('change', function () { if (input.files[0]) { label.textContent = 'Selected: ' + input.files[0].name; onFile(input.files[0]); } });
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('drag'); }); });
    zone.addEventListener('drop', function (e) {
      const f = e.dataTransfer.files[0];
      if (f) { label.textContent = 'Selected: ' + f.name; onFile(f); }
    });
    return zone;
  }

  function tooBig(file) {
    const max = (state.meta.max_upload_mb || 10) * 1024 * 1024;
    if (file.size > max) { toast('File is too large. Maximum is ' + state.meta.max_upload_mb + ' MB.', 'error'); return true; }
    return false;
  }

  function openImportDialog() {
    let file = null;
    const resultEl = h('div');
    const importBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: doImport }, 'Import');
    const modeSkip = h('input', { type: 'radio', name: 'imp-mode', value: 'skip', checked: true });
    const modeReplace = h('input', { type: 'radio', name: 'imp-mode', value: 'replace' });
    const m = openModal({
      title: 'Import Excel', size: 'lg',
      body: [
        h('div', { class: 'info-box' },
          'Upload an .xlsx file in the template format. Each row is one item; rows with the same ',
          h('strong', null, 'Invoice Date + Invoice No. + Vendor Name'), ' become one invoice with multiple items. ',
          h('button', { class: 'link-btn', onclick: downloadTemplate }, 'Download Excel Template')),
        dropzone('.xlsx,.xlsm', 'Excel .xlsx file, max ' + state.meta.max_upload_mb + ' MB', function (f) {
          if (!/\.(xlsx|xlsm)$/i.test(f.name)) { toast('Please choose an .xlsx Excel file.', 'error'); return; }
          if (tooBig(f)) return;
          file = f; importBtn.disabled = false; clear(resultEl);
        }),
        h('div', { class: 'radio-row' },
          h('strong', { class: 'small' }, 'If an invoice already exists (same Invoice No. and Vendor):'),
          h('label', null, modeSkip, h('span', null, 'Skip it (keep the existing invoice)')),
          h('label', null, modeReplace, h('span', null, 'Replace it with the data from Excel'))),
        resultEl
      ],
      footer: [h('button', { class: 'btn', onclick: function () { m.close(); } }, 'Close'), importBtn]
    });

    async function doImport() {
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', modeReplace.checked ? 'replace' : 'skip');
      importBtn.disabled = true;
      importBtn.textContent = 'Importing…';
      clear(resultEl);
      try {
        const r = await api('/api/import', { method: 'POST', body: fd });
        resultEl.appendChild(h('div', { class: 'success-box' },
          h('strong', null, r.message),
          h('div', { class: 'small' }, r.invoices + ' invoice(s) with ' + r.items + ' item(s) found in the file.'),
          r.skipped.length ? h('div', { class: 'small' }, 'Skipped: ' + r.skipped.slice(0, 20).join(', ') + (r.skipped.length > 20 ? '…' : '')) : null));
        toast(r.message, 'success');
        loadVendors();
        refreshView();
      } catch (e) {
        resultEl.appendChild(errorBox(e));
        toast('Import failed. See the details in the dialog.', 'error');
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = 'Import';
      }
    }
  }

  async function exportExcel() {
    const filters = state.view === 'invoices' ? state.filters : Object.assign({}, EMPTY_FILTERS, state.dash);
    toast('Preparing Excel file…', 'info', 2000);
    try { await download('/api/export' + qs(filters), 'invoices.xlsx'); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function downloadTemplate() {
    try { await download('/api/template', 'invoice_import_template.xlsx'); toast('Template downloaded.', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  }

  // =====================================================================
  // OCR scan
  // =====================================================================
  function openScanDialog() {
    let file = null;
    const previewEl = h('div');
    const resultEl = h('div');
    const scanBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: doScan }, 'Extract Data');
    const m = openModal({
      title: 'Scan Invoice Image', size: 'lg',
      body: [
        h('div', { class: 'info-box' },
          'Upload a clear, straight photo or scan of the invoice. The app reads it with OCR and opens the ',
          h('strong', null, 'Add Invoice'), ' form with the values it found. ', h('strong', null, 'Nothing is saved automatically'),
          ' — you check and correct the values, then click Save.'),
        dropzone('.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf', 'JPG, JPEG, PNG or PDF (text PDFs), max ' + state.meta.max_upload_mb + ' MB', function (f) {
          if (!/\.(jpe?g|png|pdf)$/i.test(f.name)) { toast('Please choose a JPG, PNG or PDF file.', 'error'); return; }
          if (tooBig(f)) return;
          file = f; scanBtn.disabled = false; clear(resultEl); clear(previewEl);
          if (/^image\//.test(f.type)) {
            const img = h('img', { class: 'preview-img', alt: 'Invoice preview' });
            img.src = URL.createObjectURL(f);
            img.onload = function () { URL.revokeObjectURL(img.src); };
            previewEl.appendChild(img);
          }
        }),
        previewEl, resultEl
      ],
      footer: [
        h('button', { class: 'btn', onclick: function () { m.close(); } }, 'Cancel'),
        scanBtn
      ]
    });

    async function doScan() {
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      scanBtn.disabled = true;
      clear(scanBtn); append(scanBtn, [h('span', { class: 'spinner' }), ' Reading invoice…']);
      clear(resultEl);
      try {
        const r = await api('/api/ocr', { method: 'POST', body: fd });
        m.close(true);
        openFormFromOcr(r);
      } catch (e) {
        resultEl.appendChild(errorBox(e));
        resultEl.appendChild(h('button', { class: 'btn', onclick: function () { m.close(true); openInvoiceForm(); } }, 'Enter the invoice manually instead'));
        toast(e.message, 'error');
      } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = 'Extract Data';
      }
    }
  }

  function openFormFromOcr(r) {
    const ex = r.extracted || {};
    const headerFlags = {};
    ['invoice_date', 'invoice_no', 'vendor_name'].forEach(function (k) { if (ex[k]) headerFlags[k] = true; });
    const items = (ex.items || []).map(function (it) {
      return {
        particulars: it.particulars || '', hsn: it.hsn || '', rate: it.rate, quantity: it.quantity,
        unit: it.unit || '', gst: it.gst, po_number: it.po_number || ''
      };
    });
    const itemFlags = items.map(function (it) {
      const f = {};
      Object.keys(it).forEach(function (k) { if (it[k] !== '' && it[k] !== null && it[k] !== undefined) f[k] = true; });
      return f;
    });
    if (!items.length && ex.po_number) { items.push({ po_number: ex.po_number }); itemFlags.push({ po_number: true }); }
    const found = r.fields_found.length + r.items_found;
    toast(found ? 'OCR found ' + r.fields_found.length + ' header field(s) and ' + r.items_found + ' item(s). Please verify.' :
      'OCR could not identify invoice fields. Please enter them manually (the text read is shown in the form).', found ? 'warn' : 'error', 6000);
    openInvoiceForm({
      invoice_date: ex.invoice_date || today(), invoice_no: ex.invoice_no || '', vendor_name: ex.vendor_name || '', items: items
    }, { ocr: { provider: r.provider, raw_text: r.raw_text, invoice_amount: ex.invoice_amount, headerFlags: headerFlags, itemFlags: itemFlags } });
  }

  // =====================================================================
  // Boot
  // =====================================================================
  async function boot() {
    const root = document.getElementById('app');
    root.appendChild(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), ' Loading…'));
    try { state.meta = await api('/api/meta'); }
    catch (e) {
      clear(root).appendChild(h('div', { class: 'panel', style: 'max-width:600px;margin:60px auto' },
        h('h2', null, 'Cannot start the application'), h('p', null, e.message),
        h('button', { class: 'btn btn-primary', onclick: function () { location.reload(); } }, 'Retry')));
      return;
    }
    renderShell();
    await loadVendors();
    window.addEventListener('hashchange', route);
    window.addEventListener('unhandledrejection', function (e) {
      toast((e.reason && e.reason.message) || 'Unexpected error.', 'error');
    });
    route();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
