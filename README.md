# Clink 通讯录

一个用原生 HTML / CSS / JavaScript 写成的通讯录，支持收藏联系人、一位联系人多个联系方式、Excel 导入导出，零第三方依赖，双击即可运行。

## 本地运行

```bash
# 在项目根目录起一个静态服务器（任选其一）
python -m http.server 8765
npx serve .
```

然后浏览器打开 <http://localhost:8765>。

## 功能

- 联系人增删改查、多字段模糊搜索、按姓名/公司排序
- 收藏联系人，收藏视图，常用联系人置顶
- 一位联系人可绑定多条联系方式（手机 / 座机 / 邮箱 / 微信 / QQ / 地址 / 其他）
- 导出 Excel（.xlsx），一位联系人一行、一种信息一列
- 导入 Excel / CSV，自动识别表头、跳过重复、提示异常行

## 目录结构

```
address-book-app/
├── index.html            页面结构
├── css/style.css         全部样式
├── js/store.js           数据层：模型、localStorage、搜索、去重
├── js/xlsx-lite.js       零依赖 xlsx 读写（ZIP + SpreadsheetML）
├── js/app.js             交互层：渲染、表单、导入导出
├── docs/                 代码规范、博客草稿、截图与视频
├── testdata/             导入功能测试文件
└── tools/                自动化验收与截图脚本（可选）
```

## 说明

- 数据保存在浏览器 `localStorage`，换浏览器/清缓存会丢失，正式使用请先导出备份。
- Excel 读写没有使用 SheetJS 等库：导出用「存储模式 ZIP + SpreadsheetML」手写，导入借助浏览器原生 `DecompressionStream` 解压后解析 XML。
