# Clink 通讯录

一个用原生 HTML / CSS / JavaScript 写成的通讯录：收藏联系人、一位联系人绑定多条联系方式、Excel 导入导出，零第三方依赖，离线可用。

> 软件工程（FZU–MU）极限编程作业 · 双人组
> 周德斌 832401329 · 黄和 832401308

## 本地运行

```bash
python -m http.server 8765
# 或 npx serve .
```

浏览器打开 <http://localhost:8765> 即可。第一次打开是空列表，可点「载入示例数据」快速体验。

## 功能对照

| 作业要求 | 实现情况 |
| --- | --- |
| 收藏联系人（25 分） | 卡片星标一键收藏/取消，收藏视图筛选，收藏置顶，侧边栏计数 |
| 添加多种联系方式（10 分） | 7 种类型（手机/座机/邮箱/微信/QQ/地址/其他），动态增删，按类型校验 |
| 导入导出（25 分） | 导出 12 列 xlsx（一人一行、一类信息一列）；导入 xlsx/csv，自动识别表头、跳过重复、提示异常行 |
| 页面样式（10 分） | 自定义视觉、卡片式布局、响应式（≤980px 单列）、键盘快捷键 |
| 云服务器部署（选做 15 分） | 未做 |

## 目录结构

```
address-book-app/
├── index.html            页面结构
├── css/style.css         全部样式（变量 → 布局 → 组件 → 响应式）
├── js/store.js           数据层：模型、localStorage、搜索、去重合并
├── js/xlsx-lite.js       零依赖 xlsx 读写（ZIP + SpreadsheetML）
├── js/app.js             交互层：渲染、表单、导入导出
├── docs/
│   ├── CODE_STANDARDS.md 代码规范
│   └── blog-draft.md     博客草稿
├── shots/                程序截图（博客配图）
├── video/clink-demo.mp4  演示视频
├── testdata/             导入功能测试文件
└── tools/                自动化验收与录制脚本（非运行必需）
```

## 技术要点

- **数据**：联系人存在 `localStorage` 的 `ab.contacts.v1`，刷新不丢；`normalize()` 兜底旧数据。
- **多联系方式**：`methods: [{ id, type, value }]` 数组，加类型不用改结构。
- **Excel 导出**：手写“存储模式 ZIP + SpreadsheetML”，单元格全部用 `inlineStr`，避免手机号被 Excel 转成科学计数法；表头冻结、自动筛选、列宽按内容设置。
- **Excel 导入**：解析 ZIP 中央目录 → `DecompressionStream('deflate-raw')` 解压 → `DOMParser` 解析工作表 → 表头别名匹配（精确 + 包含）→ 按「姓名 + 首个号码」去重 → 输出逐行结果。
- **安全**：所有渲染内容经 `esc()` 转义，避免 XSS。

## 自动化验收

需要本机安装 Edge（脚本用 Chrome DevTools 协议驱动，无第三方依赖）：

```bash
python -m http.server 8765          # 另开一个终端
node tools/e2e.mjs                  # 21 项端到端断言
node tools/shots.mjs                # 重新生成 shots/ 截图
node tools/video.mjs                # 采集录屏帧到 video/frames/
```

最近一次运行结果：**21 项全部通过**。

```
✓ 首次打开为空列表        ✓ 载入 10 位示例联系人     ✓ 星标收藏 +1
✓ 收藏视图过滤正确        ✓ 按公司搜索              ✓ 按号码片段搜索
✓ 新建保留 3 条联系方式   ✓ 缺姓名被拦截            ✓ 编辑回填正确
✓ 删除后总数回到 10       ✓ 导出 xlsx              ✓ 导出回导全部判重
✓ 外部 Excel 导入         ✓ CSV 导入               ✓ 刷新后持久化
✓ 页面无脚本异常
```

导出的 xlsx 额外用 `openpyxl` 复核过表头、行数、冻结窗格与筛选范围。

## 已知限制

- 数据仅存本地，换浏览器或清缓存会丢失，重要数据请先导出备份；
- 导入大文件（> 8MB）会被拒绝；
- 未做多标签页数据同步。
