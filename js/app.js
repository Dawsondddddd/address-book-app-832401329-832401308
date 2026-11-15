/* =========================================================
 * app.js — 页面逻辑层
 * ---------------------------------------------------------
 * 结构：
 *   1. 图标与工具函数
 *   2. 渲染（列表 / 空状态 / 统计）
 *   3. 新建与编辑（动态联系方式表单 + 校验）
 *   4. 收藏、删除
 *   5. Excel 导入 / 导出
 *   6. 事件绑定与启动
 * ========================================================= */
(function () {
  'use strict';

  /* ======================= 1. 图标与工具 ======================= */

  const ICONS = {
    mobile: '<path d="M7.5 3h3l1.2 3.6-1.9 1.3a11.5 11.5 0 006.3 6.3l1.3-1.9L21 13.5v3a2 2 0 01-2.2 2A16.5 16.5 0 013.5 5.2 2 2 0 015.5 3z"/>',
    tel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M8 20v-3.5h8V20"/>',
    email: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
    wechat: '<path d="M20 12a7.5 7.5 0 01-11 6.7L4.5 20l1.2-4A7.5 7.5 0 1120 12z"/><path d="M9.5 11.5h.01M14 11.5h.01"/>',
    qq: '<circle cx="12" cy="11" r="7.5"/><path d="M9.5 10h.01M14.5 10h.01M9 20l1.5-3.2M15 20l-1.5-3.2"/>',
    address: '<path d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    other: '<path d="M10 13a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1.2 1.2"/><path d="M14 11a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1.2-1.2"/>',
    star: '<path d="M12 3.8l2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.9z"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>',
    trash: '<path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.8 12.2a2 2 0 002 1.8h5.4a2 2 0 002-1.8L17.5 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M4.5 12.5l5 5L20 7"/>',
    alert: '<path d="M12 8v5m0 3.5h.01M10.3 3.9L2.6 17.3A2 2 0 004.3 20h15.4a2 2 0 001.7-2.7L13.7 3.9a2 2 0 00-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 8h.01"/>'
  };

  function icon(name, cls) {
    return '<svg viewBox="0 0 24 24" class="ic ' + (cls || '') + '" aria-hidden="true">' +
      (ICONS[name] || ICONS.other) + '</svg>';
  }

  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function typeMeta(type) {
    return Store.METHODS.find(function (m) { return m.key === type; }) || Store.METHODS[Store.METHODS.length - 1];
  }

  function avatarStyle(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
    const hue = hash;
    return 'background:linear-gradient(145deg,hsl(' + hue + ',68%,58%),hsl(' + ((hue + 28) % 360) + ',72%,46%))';
  }

  function initials(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '?';
    /* 中文取最后一个字，英文取首字母 */
    if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(-1);
    return trimmed.slice(0, 1).toUpperCase();
  }

  function methodLink(method) {
    const value = esc(method.value);
    if (method.type === 'email') return '<a href="mailto:' + value + '">' + value + '</a>';
    if (method.type === 'mobile' || method.type === 'tel') {
      return '<a href="tel:' + value.replace(/[^\d+]/g, '') + '">' + value + '</a>';
    }
    return value;
  }

  /* ======================= 2. Toast ======================= */

  function toast(message, type) {
    const wrap = $('#toasts');
    const node = document.createElement('div');
    node.className = 'toast toast--' + (type || 'ok');
    node.innerHTML = icon(type === 'bad' ? 'alert' : type === 'warn' ? 'info' : 'check') +
      '<span>' + esc(message) + '</span>';
    wrap.appendChild(node);
    setTimeout(function () {
      node.classList.add('is-out');
      setTimeout(function () { node.remove(); }, 220);
    }, 2400);
  }

  /* ======================= 3. 状态与渲染 ======================= */

  const state = { view: 'all', query: '', sort: 'updated' };

  function sortList(list) {
    const byFav = function (a, b) { return Number(b.favorite) - Number(a.favorite); };
    const collator = new Intl.Collator('zh-Hans-CN');
    return list.sort(function (a, b) {
      const fav = byFav(a, b);
      if (fav !== 0) return fav;
      if (state.sort === 'name') return collator.compare(a.name, b.name);
      if (state.sort === 'company') {
        return collator.compare(a.company || '\uffff', b.company || '\uffff');
      }
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
  }

  function visibleContacts() {
    let list = Store.search(state.query);
    if (state.view === 'favorite') list = list.filter(function (c) { return c.favorite; });
    return sortList(list.slice());
  }

  function renderCard(contact) {
    const meta = contact.methods.slice(0, 3);
    const extra = contact.methods.length - meta.length;
    const rows = meta.map(function (method) {
      const info = typeMeta(method.type);
      return '<li class="method-item">' +
        '<span class="mi">' + icon(method.type) + '</span>' +
        '<span class="mv">' + methodLink(method) + '</span>' +
        '</li>';
    }).join('');

    const more = extra > 0
      ? '<li class="method-item is-extra"><span class="mi">' + icon('plus') + '</span>' +
        '<span class="mv">还有 ' + extra + ' 项联系方式</span></li>'
      : '';

    const sub = [contact.company, contact.position].filter(Boolean).join(' · ');

    return '<article class="card' + (contact.favorite ? ' is-fav' : '') + '" data-id="' + contact.id + '">' +
      '<button class="card-star' + (contact.favorite ? ' is-on' : '') + '" data-act="star" type="button" ' +
      'aria-label="' + (contact.favorite ? '取消收藏' : '收藏') + '" title="' +
      (contact.favorite ? '取消收藏' : '收藏联系人') + '">' + icon('star') + '</button>' +
      '<div class="card-head">' +
      '<div class="avatar" style="' + avatarStyle(contact.name) + '">' + esc(initials(contact.name)) + '</div>' +
      '<div><h3 class="card-name">' + esc(contact.name) + '</h3>' +
      '<p class="card-sub">' + (sub ? esc(sub) : '—') + '</p></div>' +
      '</div>' +
      '<ul class="method-list">' + rows + more + '</ul>' +
      (contact.notes ? '<p class="card-sub" style="margin:0">“' + esc(contact.notes) + '”</p>' : '') +
      '<div class="card-foot">' +
      '<span class="tag">' + contact.methods.length + ' 个联系方式</span>' +
      '<div class="card-ops">' +
      '<button class="op-btn" data-act="edit" type="button">' + icon('edit') + '编辑</button>' +
      '<button class="op-btn op-btn--danger" data-act="del" type="button">' + icon('trash') + '删除</button>' +
      '</div></div>' +
      '</article>';
  }

  function render() {
    const list = visibleContacts();
    const stats = Store.stats();
    const grid = $('#contactGrid');
    const empty = $('#emptyState');

    grid.innerHTML = list.map(renderCard).join('');

    $('#navCountAll').textContent = stats.contacts;
    $('#navCountFav').textContent = stats.favorites;
    $('#statContacts').textContent = stats.contacts;
    $('#statMethods').textContent = stats.methods;
    $('#statFav').textContent = stats.favorites;
    $('#resultCount').textContent = '共 ' + list.length + ' 位联系人';
    $('#methodCount').textContent = list.reduce(function (sum, c) { return sum + c.methods.length; }, 0) +
      ' 条联系方式';

    $$('.nav-item').forEach(function (item) {
      item.classList.toggle('is-active', item.dataset.view === state.view);
    });

    $('#viewTitle').textContent = state.view === 'favorite' ? '收藏联系人' : '全部联系人';
    $('#viewSub').textContent = state.view === 'favorite'
      ? '常用的人，放在最顺手的位置'
      : '管理你的每一段人脉';

    empty.hidden = list.length > 0;
    if (!list.length) {
      if (state.query) {
        $('#emptyTitle').textContent = '没有匹配的联系人';
        $('#emptyDesc').textContent = '换个关键词试试，或清空搜索框查看全部联系人。';
      } else if (state.view === 'favorite') {
        $('#emptyTitle').textContent = '还没有收藏联系人';
        $('#emptyDesc').textContent = '点击联系人卡片右上角的星标，即可把常用的人收藏起来。';
      } else {
        $('#emptyTitle').textContent = '还没有联系人';
        $('#emptyDesc').textContent = '点击「新建联系人」手动添加，或从 Excel 批量导入。';
      }
    }
  }

  /* ======================= 4. 新建 / 编辑 ======================= */

  function methodOptions(selected) {
    return Store.METHODS.map(function (m) {
      return '<option value="' + m.key + '"' + (m.key === selected ? ' selected' : '') + '>' + m.label + '</option>';
    }).join('');
  }

  function addMethodRow(method) {
    const row = document.createElement('div');
    row.className = 'method-row';
    const info = typeMeta(method && method.type ? method.type : 'mobile');
    row.innerHTML =
      '<select class="method-type" aria-label="联系方式类型">' + methodOptions(info.key) + '</select>' +
      '<input class="method-value" type="text" maxlength="60" placeholder="' + esc(info.hint) + '" value="' +
      esc(method && method.value ? method.value : '') + '" />' +
      '<button class="row-del" type="button" aria-label="删除此项">' + icon('close') + '</button>';

    const select = $('.method-type', row);
    const input = $('.method-value', row);
    select.addEventListener('change', function () {
      const next = typeMeta(select.value);
      input.placeholder = next.hint;
      input.classList.remove('is-bad');
    });
    input.addEventListener('input', function () { input.classList.remove('is-bad'); });
    $('.row-del', row).addEventListener('click', function () {
      row.remove();
      if (!$('#methodRows').children.length) addMethodRow();
    });
    $('#methodRows').appendChild(row);
  }

  function openContactModal(id) {
    const contact = id ? Store.findById(id) : null;
    $('#fieldId').value = contact ? contact.id : '';
    $('#fieldName').value = contact ? contact.name : '';
    $('#fieldCompany').value = contact ? contact.company : '';
    $('#fieldPosition').value = contact ? contact.position : '';
    $('#fieldNotes').value = contact ? contact.notes : '';
    $('#fieldFavorite').checked = contact ? contact.favorite : false;
    $('#modalTitle').textContent = contact ? '编辑联系人' : '新建联系人';
    $('#errName').textContent = '';
    $('#errMethods').textContent = '';
    $('#fieldName').classList.remove('is-bad');

    const rows = $('#methodRows');
    rows.innerHTML = '';
    if (contact && contact.methods.length) {
      contact.methods.forEach(function (m) { addMethodRow(m); });
    } else {
      addMethodRow();
    }

    $('#contactModal').hidden = false;
    setTimeout(function () { $('#fieldName').focus(); }, 60);
  }

  function closeContactModal() {
    $('#contactModal').hidden = true;
  }

  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validatePhone(value) {
    const digits = value.replace(/[^\d]/g, '');
    return digits.length >= 5 && digits.length <= 20 && /^[\d\s+\-()]+$/.test(value);
  }

  function collectForm() {
    const methods = $$('.method-row').map(function (row) {
      return {
        type: $('.method-type', row).value,
        value: $('.method-value', row).value.trim(),
        input: $('.method-value', row)
      };
    }).filter(function (m) { return m.value !== ''; });

    return {
      id: $('#fieldId').value,
      name: $('#fieldName').value.trim(),
      company: $('#fieldCompany').value.trim(),
      position: $('#fieldPosition').value.trim(),
      notes: $('#fieldNotes').value.trim(),
      favorite: $('#fieldFavorite').checked,
      methods: methods
    };
  }

  function saveContact() {
    const data = collectForm();
    let ok = true;

    if (!data.name) {
      $('#fieldName').classList.add('is-bad');
      $('#errName').textContent = '请填写姓名';
      ok = false;
    }
    if (!data.methods.length) {
      $('#errMethods').textContent = '至少填写一项联系方式';
      ok = false;
    }
    data.methods.forEach(function (method) {
      if (method.type === 'email' && !validateEmail(method.value)) {
        method.input.classList.add('is-bad');
        $('#errMethods').textContent = '邮箱格式不正确：' + method.value;
        ok = false;
      }
      if ((method.type === 'mobile' || method.type === 'tel') && !validatePhone(method.value)) {
        method.input.classList.add('is-bad');
        $('#errMethods').textContent = '电话号码格式不正确：' + method.value;
        ok = false;
      }
    });
    if (!ok) return;

    const clean = data.methods.map(function (m) { return { type: m.type, value: m.value }; });

    if (data.id) {
      Store.update(data.id, {
        name: data.name,
        company: data.company,
        position: data.position,
        notes: data.notes,
        favorite: data.favorite,
        methods: clean
      });
      toast('已保存修改：' + data.name);
    } else {
      Store.add({
        name: data.name,
        company: data.company,
        position: data.position,
        notes: data.notes,
        favorite: data.favorite,
        methods: clean
      });
      toast('已添加联系人：' + data.name);
    }
    closeContactModal();
    render();
  }

  /* ======================= 5. 收藏 / 删除 ======================= */

  let pendingDeleteId = null;

  function toggleStar(id) {
    const isFav = Store.toggleFavorite(id);
    const contact = Store.findById(id);
    render();
    toast((isFav ? '已收藏：' : '已取消收藏：') + (contact ? contact.name : ''), isFav ? 'ok' : 'warn');
  }

  function askDelete(id) {
    const contact = Store.findById(id);
    if (!contact) return;
    pendingDeleteId = id;
    $('#confirmText').textContent = '将删除「' + contact.name + '」及其 ' + contact.methods.length + ' 条联系方式。';
    $('#confirmModal').hidden = false;
  }

  function confirmDelete() {
    if (!pendingDeleteId) return;
    const contact = Store.findById(pendingDeleteId);
    Store.remove(pendingDeleteId);
    pendingDeleteId = null;
    $('#confirmModal').hidden = true;
    render();
    toast('已删除：' + (contact ? contact.name : '联系人'), 'warn');
  }

  /* ======================= 6. Excel 导出 / 导入 ======================= */

  const EXPORT_COLUMNS = [
    { key: 'name', label: '姓名' },
    { key: 'company', label: '公司' },
    { key: 'position', label: '职位' },
    { key: 'mobile', label: '手机' },
    { key: 'tel', label: '座机' },
    { key: 'email', label: '邮箱' },
    { key: 'wechat', label: '微信' },
    { key: 'qq', label: 'QQ' },
    { key: 'address', label: '地址' },
    { key: 'other', label: '其他' },
    { key: 'notes', label: '备注' },
    { key: 'favorite', label: '是否收藏' }
  ];

  const COLUMN_WIDTHS = [11, 16, 12, 17, 15, 26, 15, 12, 28, 18, 20, 10];

  /** 一位联系人 -> 一行；同类型多个号码用“；”连接，列不增不减 */
  function contactToRow(contact) {
    const byType = {};
    contact.methods.forEach(function (method) {
      (byType[method.type] = byType[method.type] || []).push(method.value);
    });
    return EXPORT_COLUMNS.map(function (column) {
      if (column.key === 'favorite') return contact.favorite ? '是' : '否';
      if (column.key === 'name' || column.key === 'company' || column.key === 'position' || column.key === 'notes') {
        return contact[column.key] || '';
      }
      return (byType[column.key] || []).join('；');
    });
  }

  function exportExcel() {
    const list = Store.all();
    if (!list.length) {
      toast('通讯录还是空的，先添加或导入联系人吧', 'warn');
      return;
    }
    sortList(list);
    const rows = [EXPORT_COLUMNS.map(function (c) { return c.label; })];
    list.forEach(function (contact) { rows.push(contactToRow(contact)); });

    const blob = XlsxLite.buildWorkbook({ name: '通讯录', rows: rows, widths: COLUMN_WIDTHS });
    const now = new Date();
    const stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');
    XlsxLite.download(blob, '通讯录_' + stamp + '.xlsx');
    toast('已导出 ' + list.length + ' 位联系人到 Excel');
  }

  /* ----------------------- 导入字段识别 ----------------------- */

  const FIELD_RULES = [
    { key: 'name', aliases: ['姓名', '名字', '名称', '联系人', 'name'], type: null },
    { key: 'company', aliases: ['公司', '单位', '组织', '公司名称', 'company'], type: null },
    { key: 'position', aliases: ['职位', '职务', '岗位', 'title', 'position'], type: null },
    { key: 'notes', aliases: ['备注', '说明', '注释', 'notes', 'remark'], type: null },
    { key: 'favorite', aliases: ['收藏', '是否收藏', '关注', 'favorite', 'star'], type: null },
    { key: 'mobile', aliases: ['手机', '手机号', '手机号码', '电话', '联系电话', 'mobile', 'phone'], type: 'mobile' },
    { key: 'tel', aliases: ['座机', '固话', '办公电话', '座机号', 'tel', 'telephone'], type: 'tel' },
    { key: 'email', aliases: ['邮箱', '电子邮箱', '邮件', 'email', 'e-mail', 'mail'], type: 'email' },
    { key: 'wechat', aliases: ['微信', '微信号', 'wechat', 'weixin', 'wx'], type: 'wechat' },
    { key: 'qq', aliases: ['qq', 'qq号'], type: 'qq' },
    { key: 'address', aliases: ['地址', '住址', '通讯地址', 'address'], type: 'address' },
    { key: 'other', aliases: ['其他', '其他联系方式', 'other'], type: 'other' }
  ];

  function normalizeHeader(cell) {
    return String(cell || '').replace(/[\s\u3000*＊:：]/g, '').toLowerCase();
  }

  /** 表头 -> 列规则；先精确匹配，再包含匹配 */
  function detectColumns(headerRow) {
    const normalized = headerRow.map(normalizeHeader);
    const mapping = normalized.map(function (title) {
      if (!title) return null;
      const exact = FIELD_RULES.find(function (rule) {
        return rule.aliases.some(function (a) { return normalizeHeader(a) === title; });
      });
      if (exact) return exact;
      return FIELD_RULES.find(function (rule) {
        return rule.aliases.some(function (a) { return title.indexOf(normalizeHeader(a)) > -1; });
      }) || null;
    });
    return mapping;
  }

  function looksLikeHeader(row) {
    let exact = 0;
    let labelish = 0;
    let nonEmpty = 0;
    row.forEach(function (cell) {
      const title = normalizeHeader(cell);
      if (!title) return;
      nonEmpty++;
      const hit = FIELD_RULES.some(function (rule) {
        return rule.aliases.some(function (a) { return normalizeHeader(a) === title; });
      });
      if (hit) exact++;
      /* 纯文字、短、无数字：像表头而不是一行业务数据 */
      if (title.length <= 8 && !/\d/.test(title) && title.indexOf('@') < 0) labelish++;
    });
    return exact >= 2 || (exact >= 1 && nonEmpty === labelish);
  }

  function splitValues(value) {
    return String(value || '').split(/[；;、\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function rowsToContacts(rows) {
    if (!rows.length) return { contacts: [], bad: [] };

    const hasHeader = looksLikeHeader(rows[0]);
    let mapping;
    let dataRows;

    if (hasHeader) {
      mapping = detectColumns(rows[0]);
      dataRows = rows.slice(1);
    } else {
      mapping = detectColumns(EXPORT_COLUMNS.map(function (c) { return c.label; }));
      dataRows = rows;
    }

    const contacts = [];
    const bad = [];

    dataRows.forEach(function (row, index) {
      const lineNo = index + (hasHeader ? 2 : 1);
      const record = { company: '', position: '', notes: '', favorite: false, methods: [] };
      let methodMissing = false;

      mapping.forEach(function (rule, col) {
        if (!rule) return;
        const cell = String(row[col] == null ? '' : row[col]).trim();
        if (!cell) return;

        if (rule.type) {
          const values = (rule.type === 'address' || rule.type === 'other')
            ? [cell]
            : splitValues(cell);
          values.forEach(function (value) {
            record.methods.push({ type: rule.type, value: value });
          });
        } else if (rule.key === 'favorite') {
          record.favorite = /^(是|yes|true|1|收藏|y)$/i.test(cell);
        } else if (rule.key === 'name') {
          record.name = cell;
        } else {
          record[rule.key] = cell;
        }
      });

      if (!record.name && !record.methods.length) {
        bad.push({ line: lineNo, reason: '缺少姓名与联系方式' });
        return;
      }
      if (!record.name) {
        bad.push({ line: lineNo, reason: '缺少姓名' });
        return;
      }
      if (!record.methods.length) methodMissing = true;
      if (methodMissing) {
        bad.push({ line: lineNo, reason: '「' + record.name + '」没有任何联系方式' });
        return;
      }
      contacts.push(record);
    });

    return { contacts: contacts, bad: bad };
  }

  function showImportResult(fileName, result, parsed) {
    $('#importFile').textContent = fileName + ' · 共读取 ' + parsed.rows.length + ' 行';
    $('#importOk').textContent = result.added;
    $('#importSkip').textContent = result.skipped;
    $('#importBad').textContent = result.bad.length;

    const log = $('#importLog');
    const lines = [];
    result.log.forEach(function (item) {
      lines.push('<div class="log-' + item.kind + '">' + esc(item.text) + '</div>');
    });
    if (!lines.length) lines.push('<div class="log-ok">文件解析完成，没有可显示的行明细</div>');
    log.innerHTML = lines.join('');
    $('#importModal').hidden = false;
  }

  async function importFile(file) {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      toast('请选择 .xlsx 或 .csv 文件', 'bad');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('文件过大（超过 8MB），请拆分后再导入', 'bad');
      return;
    }

    try {
      const parsed = await XlsxLite.readFile(file);
      const { contacts, bad } = rowsToContacts(parsed.rows);
      if (!contacts.length && !bad.length) {
        toast('文件里没有读到数据，请检查表头是否正确', 'warn');
        return;
      }
      const merged = Store.merge(contacts);
      render();

      const log = [];
      contacts.slice(0, 6).forEach(function (c) {
        const name = c.name;
        const hit = merged.results.find(function (r) { return r.name === name; });
        log.push({
          kind: hit && hit.status === 'skipped' ? 'skip' : 'ok',
          text: name + ' · ' + c.methods.length + ' 项联系方式' +
            (hit && hit.status === 'skipped' ? '（已存在，跳过）' : '')
        });
      });
      if (contacts.length > 6) log.push({ kind: 'ok', text: '…… 其余 ' + (contacts.length - 6) + ' 位联系人已一并处理' });
      bad.slice(0, 4).forEach(function (item) {
        log.push({ kind: 'bad', text: '第 ' + item.line + ' 行：' + item.reason });
      });

      showImportResult(file.name, { added: merged.added, skipped: merged.skipped, bad: bad, log: log }, parsed);
      toast('导入完成：新增 ' + merged.added + ' 位，跳过 ' + merged.skipped + ' 位', merged.added ? 'ok' : 'warn');
    } catch (err) {
      console.error('[import] 失败', err);
      toast('导入失败：' + (err && err.message ? err.message : '文件无法解析'), 'bad');
    } finally {
      $('#fileInput').value = '';
    }
  }

  /* ======================= 7. 事件绑定 ======================= */

  function bind() {
    $('#btnAdd').addEventListener('click', function () { openContactModal(); });
    $('#btnAddEmpty').addEventListener('click', function () { openContactModal(); });
    $('#btnSave').addEventListener('click', saveContact);
    $('#btnCancelModal').addEventListener('click', closeContactModal);
    $('#btnCloseModal').addEventListener('click', closeContactModal);
    $('#btnAddMethod').addEventListener('click', function () { addMethodRow(); });

    $('#btnExport').addEventListener('click', exportExcel);
    $('#btnImport').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (e) { importFile(e.target.files[0]); });
    $('#btnImportDone').addEventListener('click', function () { $('#importModal').hidden = true; });
    $('#btnCloseImport').addEventListener('click', function () { $('#importModal').hidden = true; });

    $('#btnDemo').addEventListener('click', loadDemo);
    $('#btnDemoEmpty').addEventListener('click', loadDemo);

    $('#btnCancelDelete').addEventListener('click', function () {
      pendingDeleteId = null;
      $('#confirmModal').hidden = true;
    });
    $('#btnConfirmDelete').addEventListener('click', confirmDelete);

    $$('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () {
        state.view = item.dataset.view;
        render();
      });
    });

    const search = $('#searchInput');
    let timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.query = search.value;
        render();
      }, 120);
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        search.value = '';
        state.query = '';
        render();
      }
    });

    $('#sortSelect').addEventListener('change', function (e) {
      state.sort = e.target.value;
      render();
    });

    $('#contactGrid').addEventListener('click', function (e) {
      const card = e.target.closest('.card');
      if (!card) return;
      const button = e.target.closest('[data-act]');
      const id = card.dataset.id;
      if (!button) { openContactModal(id); return; }
      if (button.dataset.act === 'star') toggleStar(id);
      if (button.dataset.act === 'edit') openContactModal(id);
      if (button.dataset.act === 'del') askDelete(id);
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        search.focus();
        search.select();
      }
      if (e.key === 'Escape') {
        if (!$('#contactModal').hidden) closeContactModal();
        if (!$('#confirmModal').hidden) { pendingDeleteId = null; $('#confirmModal').hidden = true; }
        if (!$('#importModal').hidden) $('#importModal').hidden = true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('#contactModal').hidden) {
        e.preventDefault();
        saveContact();
      }
    });

    $$('[data-close="true"]').forEach(function (mask) {
      mask.addEventListener('click', function () {
        $('#contactModal').hidden = true;
        $('#confirmModal').hidden = true;
        $('#importModal').hidden = true;
        pendingDeleteId = null;
      });
    });
  }

  function loadDemo() {
    const added = Store.seedDemo();
    render();
    toast(added ? '已载入 ' + added + ' 位示例联系人' : '示例数据已经在通讯录里了', added ? 'ok' : 'warn');
  }

  /* ======================= 8. 启动 ======================= */

  Store.load();
  bind();
  render();

  /* 调试 / 自动化测试入口，不影响正常使用 */
  window.Clink = {
    state: state,
    render: render,
    openContactModal: openContactModal,
    importFile: importFile,
    exportExcel: exportExcel,
    rowsToContacts: rowsToContacts,
    visibleContacts: visibleContacts
  };
})();
