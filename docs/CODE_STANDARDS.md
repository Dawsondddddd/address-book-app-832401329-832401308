# Clink 通讯录 · 代码规范

> 本规范由两人共同约定，提交前互相检查。约定优先于个人习惯，出现分歧以本文档为准。

## 1. 技术约束

1. 只使用原生 HTML / CSS / JavaScript（ES2017+），**不引入任何第三方库或 CDN**，保证离线可用、评审时无需联网安装依赖。
2. 兼容 Chrome / Edge 90 及以上（依赖 `DecompressionStream` 解压 xlsx）。
3. 页面为单页应用，不使用构建工具；所有脚本以 `<script>` 顺序引入，模块之间通过全局命名空间通信（`Store`、`XlsxLite`）。

## 2. 目录与文件

```
css/style.css        样式（按“变量 → 布局 → 组件 → 响应式”分区，区块间用注释分隔）
js/store.js          数据层，不操作 DOM
js/xlsx-lite.js      Excel 读写，不依赖业务数据
js/app.js            交互层，负责渲染与事件
docs/                文档、截图、视频
testdata/            导入测试文件
tools/               自动化脚本（非运行必需）
```

- 文件名一律小写，多个单词用中划线：`xlsx-lite.js`。
- 一个文件只放一个职责；新增功能优先考虑放在已有模块，避免再造一个全局变量。

## 3. 命名

| 类型 | 规范 | 示例 |
| --- | --- | --- |
| 变量 / 函数 | 小驼峰 | `methodRows`、`renderCard()` |
| 常量 | 全大写 + 下划线 | `METHOD_TYPES`、`EXPORT_COLUMNS` |
| 私有函数 | 小驼峰，文件内不导出 | `avatarStyle()` |
| DOM id | 小驼峰 | `#contactGrid`、`#fieldName` |
| CSS 类 | 小写中划线，组件内用 `__`/`--` 表示层级与状态 | `.card-foot`、`.nav-item.is-active`、`.btn--primary` |
| localStorage 键 | 小写点分，带版本号 | `ab.contacts.v1` |

语义优先：不要出现 `data1`、`temp`、`flag` 这类名字；布尔值以 `is/has/can` 开头。

## 4. 代码风格

- 2 空格缩进；语句结尾必须带分号；字符串统一用单引号（HTML 模板例外）。
- 不使用 `var`；能用 `const` 就不用 `let`。
- 函数保持短小：单个函数不超过 60 行，超过就拆。
- 提前返回，减少嵌套：

```js
// 推荐
if (!contact) return;
render(contact);

// 不推荐
if (contact) {
  render(contact);
}
```

- 数组遍历优先 `forEach` / `map` / `filter`，需要中断时才用 `for`。
- 异步统一 `async/await`，错误用 `try/catch` 兜住并给出用户可读的提示。

## 5. 注释

- 每个 JS 文件顶部写文件头：职责、依赖、作者。
- 对外暴露的函数写 JSDoc，说明参数与返回值。
- 只注释“为什么”，不复述“是什么”；算法类代码（如 ZIP 结构、CRC32）要写清思路来源。

```js
/**
 * 合并导入数据
 * @param {Array} list 解析出来的联系人
 * @returns {{added:number, skipped:number, results:Array}}
 */
function merge(list) { /* ... */ }
```

## 6. 安全与健壮性

1. 所有来自用户或文件的文本，渲染进 `innerHTML` 前必须经过 `esc()` 转义，禁止拼接未转义变量。
2. `JSON.parse`、文件解析、`localStorage` 读写一律 `try/catch`，失败时降级并提示，不允许白屏。
3. 导入文件先校验扩展名与大小（≤ 8MB），再解析。
4. 表单提交前做前端校验：姓名必填、至少一条联系方式、邮箱/电话格式。

## 7. Git 提交规范

采用 Conventional Commits，描述用中文，一次提交只做一件事：

```
feat(store): 联系人数据模型与 localStorage 持久化
fix(import): 修复空行被当成联系人的问题
docs: 补充代码规范文档
style: 统一卡片圆角与阴影
test: 增加端到端验收脚本
chore: 初始化项目结构
```

- 分支：`main` 保持可运行；功能开发在 `feat/xxx` 分支，合并前互相 review。
- 提交信息写“做了什么 + 为什么”，禁止 `update`、`修改`、`1` 这类无意义描述。
- 合并前自查：页面能打开、控制台无报错、`tools/e2e.mjs` 全部通过。

## 8. 协作约定

1. 改动公共文件（`index.html`、`style.css`、`store.js`）前先在群里说一声，避免同时改同一段。
2. 接口先约定后编码：`Store` 暴露的方法名、联系人对象字段（`id/name/company/position/methods/notes/favorite/createdAt/updatedAt`）在开工前确定，后续只增不改。
3. 每天的代码当天合并，不留过夜分支。
4. 遇到阻塞超过 30 分钟，直接在群里同步，另一人接手或一起看。

## 9. 评审清单（Review Checklist）

- [ ] 新增功能是否在 README 的功能列表中体现
- [ ] 是否引入第三方依赖（不允许）
- [ ] 用户输入是否全部转义
- [ ] 空数据、异常文件、超长文本是否有兜底
- [ ] 移动端（≤ 980px）是否可用
- [ ] 是否补充了对应的测试或手动验证步骤
