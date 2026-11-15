/* =========================================================
 * xlsx-lite.js — 零依赖的 Excel(.xlsx) 读写工具
 * ---------------------------------------------------------
 * 为什么不用 SheetJS：
 *   1. 作业要求可以在离线 / 校内网环境打开，不能依赖 CDN；
 *   2. 通讯录的表格结构固定，只需要「写一个 sheet」和「读一个 sheet」；
 *   3. 手写一遍 ZIP + SpreadsheetML 更能说明实现思路。
 *
 * 写：把二维数组序列化成 SpreadsheetML，再用「存储模式 ZIP」打包。
 * 读：解析 ZIP 中央目录 -> 定位 xl/worksheets/*.xml -> 用浏览器
 *     原生 DecompressionStream 解压 -> DOMParser 解析单元格。
 * ========================================================= */
(function (global) {
  'use strict';

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  /* ------------------------- 基础工具 ------------------------- */

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function xmlEscape(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      /* XML 1.0 不允许的控制字符，直接剔除，避免 Excel 报“文件损坏” */
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  function colName(index) {
    let name = '';
    let n = index;
    do {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return name;
  }

  function colIndex(ref) {
    let n = 0;
    for (const ch of ref.toUpperCase()) {
      if (ch < 'A' || ch > 'Z') break;
      n = n * 26 + (ch.charCodeAt(0) - 64);
    }
    return n - 1;
  }

  /* ------------------------- ZIP 写入 ------------------------- */

  function dosStamp(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time: time & 0xffff, date: day & 0xffff };
  }

  /** 以“仅存储、不压缩”的方式生成 ZIP，Excel / WPS 均可正常打开 */
  function zipStore(files) {
    const stamp = dosStamp(new Date());
    const locals = [];
    const centrals = [];
    let offset = 0;

    files.forEach(function (file) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);          // version needed
      lv.setUint16(6, 0x0800, true);      // UTF-8 文件名
      lv.setUint16(8, 0, true);           // 存储模式
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);          // version made by
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);          // extra
      cv.setUint16(32, 0, true);          // comment
      cv.setUint16(34, 0, true);          // disk
      cv.setUint16(36, 0, true);          // internal attrs
      cv.setUint32(38, 0, true);          // external attrs
      cv.setUint32(42, offset, true);     // local header offset
      central.set(nameBytes, 46);

      locals.push(local, data);
      centrals.push(central);
      offset += local.length + data.length;
    });

    const centralSize = centrals.reduce(function (sum, c) { return sum + c.length; }, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(locals.concat(centrals, [end]), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* ------------------------- SpreadsheetML 生成 ------------------------- */

  function buildSheetXml(rows, widths) {
    const cols = widths && widths.length
      ? '<cols>' + widths.map(function (w, i) {
          return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
        }).join('') + '</cols>'
      : '';

    const body = rows.map(function (row, r) {
      const cells = row.map(function (value, c) {
        if (value === null || value === undefined || value === '') return '';
        const ref = colName(c) + (r + 1);
        const style = r === 0 ? ' s="1"' : ' s="2"';
        return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' +
          xmlEscape(value) + '</t></is></c>';
      }).join('');
      return '<row r="' + (r + 1) + '"' + (r === 0 ? ' ht="22" customHeight="1"' : '') + '>' + cells + '</row>';
    }).join('');

    const maxCol = colName(Math.max(0, (rows[0] || []).length - 1));
    const maxRow = Math.max(1, rows.length);

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + maxCol + maxRow + '"/>' +
      '<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="18"/>' +
      cols +
      '<sheetData>' + body + '</sheetData>' +
      '<autoFilter ref="A1:' + maxCol + maxRow + '"/>' +
      '</worksheet>';
  }

  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="等线"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="等线"/></font>' +
    '<font><sz val="11"/><color rgb="FF1F2937"/><name val="等线"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">' +
    '<alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
    '<alignment vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /**
   * 生成 xlsx Blob
   * @param {{name?:string, rows:string[][], widths?:number[]}} options
   */
  function buildWorkbook(options) {
    const sheetName = (options.name || 'Sheet1').replace(/[\\\/\?\*\[\]:]/g, '');
    const rows = options.rows || [];
    const files = [
      {
        name: '[Content_Types].xml',
        data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>')
      },
      {
        name: '_rels/.rels',
        data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>')
      },
      {
        name: 'xl/workbook.xml',
        data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets><sheet name="' + xmlEscape(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>' +
          '</workbook>')
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>')
      },
      { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
      {
        name: 'xl/worksheets/sheet1.xml',
        data: encoder.encode(buildSheetXml(rows, options.widths))
      }
    ];
    return zipStore(files);
  }

  /* ------------------------- ZIP 读取 ------------------------- */

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('当前浏览器不支持解压，请使用 Chrome / Edge 90+ 打开');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function listZipEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    const from = Math.max(0, bytes.length - 66000);
    for (let i = bytes.length - 22; i >= from; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 xlsx 文件（未找到 ZIP 结构）');

    const total = view.getUint16(eocd + 10, true);
    let pointer = view.getUint32(eocd + 16, true);
    const entries = new Map();

    for (let i = 0; i < total; i++) {
      if (view.getUint32(pointer, true) !== 0x02014b50) break;
      const method = view.getUint16(pointer + 10, true);
      const compSize = view.getUint32(pointer + 20, true);
      const nameLen = view.getUint16(pointer + 28, true);
      const extraLen = view.getUint16(pointer + 30, true);
      const commentLen = view.getUint16(pointer + 32, true);
      const localOffset = view.getUint32(pointer + 42, true);
      const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLen));

      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      entries.set(name, { method: method, size: compSize, start: dataStart });
      pointer += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function readEntry(bytes, entries, name) {
    const entry = entries.get(name);
    if (!entry) return null;
    const raw = bytes.subarray(entry.start, entry.start + entry.size);
    return entry.method === 0 ? raw : await inflateRaw(raw);
  }

  function parseXml(bytes) {
    const text = decoder.decode(bytes);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Excel 内部 XML 解析失败');
    return doc;
  }

  function textOf(element) {
    let out = '';
    const nodes = element.getElementsByTagName('t');
    for (let i = 0; i < nodes.length; i++) out += nodes[i].textContent;
    return out;
  }

  function findFirstSheetPath(entries) {
    const names = Array.from(entries.keys());
    const candidates = names
      .filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })
      .sort();
    if (candidates.length) return candidates[0];
    const fallback = names.find(function (n) { return /^xl\/worksheets\/.+\.xml$/.test(n); });
    return fallback || null;
  }

  function parseSheet(doc, shared) {
    const rows = [];
    const rowNodes = doc.getElementsByTagName('row');
    for (let i = 0; i < rowNodes.length; i++) {
      const rowNode = rowNodes[i];
      const rowIndex = parseInt(rowNode.getAttribute('r'), 10) - 1 || rows.length;
      const cells = [];
      const cellNodes = rowNode.getElementsByTagName('c');
      for (let j = 0; j < cellNodes.length; j++) {
        const cell = cellNodes[j];
        const ref = cell.getAttribute('r') || '';
        const index = colIndex(ref.replace(/[0-9]/g, '')) ;
        const type = cell.getAttribute('t');
        let value = '';

        if (type === 'inlineStr') {
          const inline = cell.getElementsByTagName('is')[0];
          value = inline ? textOf(inline) : '';
        } else if (type === 's') {
          const vNode = cell.getElementsByTagName('v')[0];
          const idx = vNode ? parseInt(vNode.textContent, 10) : -1;
          value = shared[idx] !== undefined ? shared[idx] : '';
        } else {
          const vNode = cell.getElementsByTagName('v')[0];
          value = vNode ? vNode.textContent : '';
          if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
        }
        if (index >= 0) cells[index] = value;
      }
      rows[rowIndex] = cells;
    }

    /* 补齐空洞并去掉尾部全空行 */
    return rows
      .filter(function (r) { return r && r.some(function (v) { return String(v || '').trim() !== ''; }); })
      .map(function (r) {
        const width = r.length;
        const out = new Array(width);
        for (let i = 0; i < width; i++) out[i] = r[i] === undefined ? '' : r[i];
        return out;
      });
  }

  async function parseXlsx(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const entries = listZipEntries(bytes);

    let shared = [];
    const sharedBytes = await readEntry(bytes, entries, 'xl/sharedStrings.xml');
    if (sharedBytes) {
      const sharedDoc = parseXml(sharedBytes);
      const items = sharedDoc.getElementsByTagName('si');
      shared = Array.from(items).map(function (item) { return textOf(item); });
    }

    const sheetPath = findFirstSheetPath(entries);
    if (!sheetPath) throw new Error('文件中没有找到工作表');
    const sheetBytes = await readEntry(bytes, entries, sheetPath);
    if (!sheetBytes) throw new Error('工作表内容为空');

    const rows = parseSheet(parseXml(sheetBytes), shared);
    return { rows: rows, sheet: sheetPath };
  }

  /* ------------------------- CSV 读取 ------------------------- */

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const src = text.replace(/^\uFEFF/, '');

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
        } else field += ch;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === ',') { row.push(field); field = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); });
  }

  async function readFile(file) {
    if (/\.csv$/i.test(file.name)) {
      return { rows: parseCsv(await file.text()), sheet: 'CSV' };
    }
    return parseXlsx(await file.arrayBuffer());
  }

  /* ------------------------- 导出 ------------------------- */

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  global.XlsxLite = {
    buildWorkbook: buildWorkbook,
    parseXlsx: parseXlsx,
    parseCsv: parseCsv,
    readFile: readFile,
    download: download,
    colName: colName
  };
})(window);
