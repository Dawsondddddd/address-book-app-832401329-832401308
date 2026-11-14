/* =========================================================
 * store.js — 数据层
 * ---------------------------------------------------------
 * 职责：联系人数据的读写、增删改查、收藏切换、统计与示例数据。
 * 存储：localStorage（键 ab.contacts.v1），同步 JSON 序列化。
 * 设计：不操作 DOM，方便单独测试；页面层只负责渲染。
 * ========================================================= */
(function (global) {
  'use strict';

  const KEY = 'ab.contacts.v1';

  /** 联系方式类型，顺序即表单下拉框顺序 */
  const METHODS = [
    { key: 'mobile', label: '手机', hint: '138 0000 0000', kind: 'phone' },
    { key: 'tel', label: '座机', hint: '0591-8888 6666', kind: 'phone' },
    { key: 'email', label: '邮箱', hint: 'name@example.com', kind: 'email' },
    { key: 'wechat', label: '微信', hint: '微信号', kind: 'text' },
    { key: 'qq', label: 'QQ', hint: 'QQ 号', kind: 'text' },
    { key: 'address', label: '地址', hint: '省 / 市 / 详细地址', kind: 'text' },
    { key: 'other', label: '其他', hint: '自定义联系方式', kind: 'text' }
  ];

  const DEFAULT_SEED = [
    {
      name: '林晚晴', company: '字节跳动', position: '产品经理', favorite: true, notes: '上次 Meetup 认识',
      methods: [
        { type: 'mobile', value: '138 0013 8000' },
        { type: 'email', value: 'wanqing.lin@bytedance.com' },
        { type: 'wechat', value: 'wanqing_l' }
      ]
    },
    {
      name: '陈子墨', company: '厦门大学', position: '副教授', favorite: false, notes: '软件工程课程合作老师',
      methods: [
        { type: 'mobile', value: '139 5920 1144' },
        { type: 'email', value: 'zmchen@xmu.edu.cn' },
        { type: 'address', value: '厦门市思明区思明南路 422 号' }
      ]
    },
    {
      name: '苏念', company: '网易', position: 'UI 设计师', favorite: true, notes: '设计稿对接人',
      methods: [
        { type: 'wechat', value: 'sunian_design' },
        { type: 'qq', value: '82310044' },
        { type: 'email', value: 'sunian@163.com' }
      ]
    },
    {
      name: '赵启明', company: '华为', position: '后端工程师', favorite: false, notes: '',
      methods: [
        { type: 'mobile', value: '186 2100 7788' },
        { type: 'tel', value: '0755-2878 0808' },
        { type: 'email', value: 'zhaoqm@huawei.com' }
      ]
    },
    {
      name: '何雨桐', company: '自由职业', position: '插画师', favorite: true, notes: '项目视觉外包',
      methods: [
        { type: 'wechat', value: 'yutong_art' },
        { type: 'address', value: '杭州市西湖区文三路 90 号' }
      ]
    },
    {
      name: '顾清和', company: '招商银行', position: '客户经理', favorite: false, notes: '信用卡业务',
      methods: [
        { type: 'mobile', value: '135 6666 2211' },
        { type: 'tel', value: '0591-8888 6666' },
        { type: 'email', value: 'guqinghe@cmbchina.com' }
      ]
    },
    {
      name: '沈亦舟', company: '宁德时代', position: '硬件工程师', favorite: false, notes: '',
      methods: [
        { type: 'mobile', value: '137 8888 9900' },
        { type: 'email', value: 'shenyizhou@catl.com' },
        { type: 'qq', value: '40218877' }
      ]
    },
    {
      name: '白露', company: '厦门日报', position: '记者', favorite: true, notes: '校庆报道采访',
      methods: [
        { type: 'mobile', value: '158 6000 3322' },
        { type: 'email', value: 'bail@xmrb.com' },
        { type: 'wechat', value: 'bailu_reporter' }
      ]
    },
    {
      name: '周牧云', company: '福州大学', position: '辅导员', favorite: false, notes: '请假 / 证明材料',
      methods: [
        { type: 'tel', value: '0591-2286 6555' },
        { type: 'email', value: 'zhoumy@fzu.edu.cn' },
        { type: 'address', value: '福州市闽侯县学园路 2 号' }
      ]
    },
    {
      name: '郑北', company: '独立开发者', position: '全栈工程师', favorite: true, notes: '开源项目伙伴',
      methods: [
        { type: 'email', value: 'zhengbei.dev@gmail.com' },
        { type: 'wechat', value: 'north_dev' },
        { type: 'qq', value: '100200300' },
        { type: 'address', value: '深圳市南山区科技园' }
      ]
    }
  ];

  let contacts = [];

  function uid(prefix) {
    return (prefix || 'c') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normalizeMethods(list) {
    return (list || [])
      .map(function (m) {
        const value = String(m.value == null ? '' : m.value).trim();
        if (!value) return null;
        const type = METHODS.some(function (t) { return t.key === m.type; }) ? m.type : 'other';
        return { id: m.id || uid('m'), type: type, value: value };
      })
      .filter(Boolean);
  }

  function normalize(raw) {
    const now = new Date().toISOString();
    return {
      id: raw.id || uid('c'),
      name: String(raw.name || '').trim(),
      company: String(raw.company || '').trim(),
      position: String(raw.position || '').trim(),
      notes: String(raw.notes || '').trim(),
      favorite: Boolean(raw.favorite),
      methods: normalizeMethods(raw.methods),
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now
    };
  }

  function load() {
    try {
      const text = localStorage.getItem(KEY);
      const list = text ? JSON.parse(text) : [];
      contacts = Array.isArray(list) ? list.map(normalize) : [];
    } catch (err) {
      console.warn('[store] 读取本地数据失败，已重置为空列表', err);
      contacts = [];
    }
    return contacts;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(contacts));
      return true;
    } catch (err) {
      console.error('[store] 保存失败（可能是存储空间不足）', err);
      return false;
    }
  }

  function all() { return contacts.slice(); }

  function findById(id) {
    return contacts.find(function (c) { return c.id === id; }) || null;
  }

  function add(raw) {
    const contact = normalize(Object.assign({}, raw, {
      id: uid('c'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    contacts.unshift(contact);
    save();
    return contact;
  }

  function update(id, patch) {
    const index = contacts.findIndex(function (c) { return c.id === id; });
    if (index < 0) return null;
    contacts[index] = normalize(Object.assign({}, contacts[index], patch, {
      id: contacts[index].id,
      createdAt: contacts[index].createdAt,
      updatedAt: new Date().toISOString()
    }));
    save();
    return contacts[index];
  }

  function remove(id) {
    const before = contacts.length;
    contacts = contacts.filter(function (c) { return c.id !== id; });
    const changed = contacts.length !== before;
    if (changed) save();
    return changed;
  }

  function toggleFavorite(id) {
    const target = findById(id);
    if (!target) return false;
    target.favorite = !target.favorite;
    target.updatedAt = new Date().toISOString();
    save();
    return target.favorite;
  }

  /** 多字段模糊搜索：姓名 / 公司 / 职位 / 备注 / 任一联系方式 */
  function search(keyword) {
    const q = String(keyword || '').trim().toLowerCase();
    if (!q) return all();
    /* 号码输入常常不带空格/横线，比较时把分隔符去掉再比一次 */
    const compact = q.replace(/[\s\-()（）]/g, '');
    return contacts.filter(function (c) {
      return [c.name, c.company, c.position, c.notes].some(function (field) {
        return field.toLowerCase().indexOf(q) > -1;
      }) || c.methods.some(function (m) {
        const value = m.value.toLowerCase();
        if (value.indexOf(q) > -1) return true;
        return compact !== '' && value.replace(/[\s\-()（）]/g, '').indexOf(compact) > -1;
      });
    });
  }

  function stats() {
    const methodCount = contacts.reduce(function (sum, c) { return sum + c.methods.length; }, 0);
    const favCount = contacts.filter(function (c) { return c.favorite; }).length;
    return { contacts: contacts.length, methods: methodCount, favorites: favCount };
  }

  /** 去重键：姓名 + 第一个电话/邮箱（防止同名不同人误判） */
  function identityOf(raw) {
    const primary = (raw.methods || []).find(function (m) {
      return m.type === 'mobile' || m.type === 'tel' || m.type === 'email';
    });
    return String(raw.name || '').trim().toLowerCase() + '|' +
      String(primary ? primary.value : '').replace(/[\s\-()]/g, '').toLowerCase();
  }

  /**
   * 合并导入数据
   * @returns {{added:number, skipped:number, results:Array<{name:string, status:'added'|'skipped'}>}}
   */
  function merge(list) {
    const existing = new Set(contacts.map(identityOf));
    let added = 0;
    let skipped = 0;
    const results = [];
    (list || []).forEach(function (item) {
      const key = identityOf(item);
      if (existing.has(key)) {
        skipped++;
        results.push({ name: item.name, status: 'skipped' });
        return;
      }
      existing.add(key);
      contacts.unshift(normalize(Object.assign({}, item, {
        id: uid('c'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })));
      added++;
      results.push({ name: item.name, status: 'added' });
    });
    if (added) save();
    return { added: added, skipped: skipped, results: results };
  }

  /** 第一课示例数据：仅在用户主动点击时使用 */
  function seedDemo() {
    const existing = new Set(contacts.map(identityOf));
    let added = 0;
    DEFAULT_SEED.forEach(function (item, index) {
      if (existing.has(identityOf(item))) return;
      const stamp = new Date(Date.now() - index * 3600 * 1000).toISOString();
      contacts.push(normalize(Object.assign({}, item, {
        id: uid('c'),
        createdAt: stamp,
        updatedAt: stamp
      })));
      added++;
    });
    if (added) save();
    return added;
  }

  function clear() {
    contacts = [];
    save();
  }

  global.Store = {
    KEY: KEY,
    METHODS: METHODS,
    load: load,
    save: save,
    all: all,
    findById: findById,
    add: add,
    update: update,
    remove: remove,
    toggleFavorite: toggleFavorite,
    search: search,
    stats: stats,
    merge: merge,
    seedDemo: seedDemo,
    clear: clear,
    uid: uid
  };
})(window);
