// Builders for the e-book tests: GBK bytes, zip files, small EPUBs. No dependencies (node:zlib is built in).
import zlib from "node:zlib";

/* ---- GBK ---- */
let gbkMap = null;
function gbkTable() {
  if (gbkMap) return gbkMap;
  gbkMap = new Map();
  const dec = new TextDecoder("gbk");
  const pair = new Uint8Array(2);
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      if (trail === 0x7f) continue;
      pair[0] = lead; pair[1] = trail;
      const s = dec.decode(pair);
      if (s.length === 1 && s !== "�" && !gbkMap.has(s)) gbkMap.set(s, [lead, trail]);
    }
  }
  return gbkMap;
}
export function gbkEncode(str) {
  const table = gbkTable(), out = [];
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) { out.push(cp); continue; }
    const b = table.get(ch);
    if (!b) throw new Error("not in GBK: " + ch);
    out.push(b[0], b[1]);
  }
  return Uint8Array.from(out);
}

/* ---- zip ---- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(entries) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const method = e.store ? 0 : 8;
    const body = e.store ? raw : zlib.deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(local, name, body);
    central.push(cd, name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...central, end]));
}

/* ---- epub ---- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// nested list from a flat [{d}] list: [{item, kids}]
function nest(flat) {
  const root = { kids: [] }, stack = [{ d: -1, node: root }];
  for (const item of flat) {
    while (stack[stack.length - 1].d >= item.d) stack.pop();
    const node = { item, kids: [] };
    stack[stack.length - 1].node.kids.push(node);
    stack.push({ d: item.d, node });
  }
  return root.kids;
}

/* title, author, lang; chapters: [{ title, html }] (html is the body content; chapter files are OEBPS/text/chN.xhtml);
   nav: "nav" (EPUB 3 nav.xhtml) or "ncx"; toc: optional [{ title, href, d }] with href relative to OEBPS/ (default:
   one top-level entry per chapter). */
export function makeEpub({ title = "T", author = "A", lang = "en", chapters = [], nav = "nav", toc } = {}) {
  const files = chapters.map((c, i) => ({ id: "c" + (i + 1), href: "text/ch" + (i + 1) + ".xhtml", ...c }));
  const entries = toc || files.map((f, i) => ({ title: chapters[i].title, href: f.href, d: 0 }));
  const tree = nest(entries);
  const head = '<?xml version="1.0" encoding="utf-8"?>\n';
  const navList = (nodes) => "<ol>" + nodes.map((n) =>
    '<li><a href="' + esc(n.item.href) + '">' + esc(n.item.title) + "</a>" + (n.kids.length ? navList(n.kids) : "") + "</li>").join("") + "</ol>";
  let np = 0;
  const ncxList = (nodes) => nodes.map((n) => {
    np++;
    return '<navPoint id="n' + np + '" playOrder="' + np + '"><navLabel><text>' + esc(n.item.title) + '</text></navLabel><content src="' +
      esc(n.item.href) + '"/>' + ncxList(n.kids) + "</navPoint>";
  }).join("");
  const list = [
    { name: "mimetype", data: "application/epub+zip", store: true },
    { name: "META-INF/container.xml", data: head + '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>' +
      '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
  ];
  const manifest = files.map((f) => '<item id="' + f.id + '" href="' + f.href + '" media-type="application/xhtml+xml"/>');
  if (nav === "nav") {
    manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
    list.push({ name: "OEBPS/nav.xhtml", data: head + '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body>' +
      '<nav epub:type="toc" id="toc"><h1>Contents</h1>' + navList(tree) + "</nav></body></html>" });
  } else {
    manifest.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
    list.push({ name: "OEBPS/toc.ncx", data: head + '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>' + esc(title) +
      "</text></docTitle><navMap>" + ncxList(tree) + "</navMap></ncx>" });
  }
  list.push({ name: "OEBPS/content.opf", data: head + '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:1</dc:identifier><dc:title>' + esc(title) +
    "</dc:title><dc:creator>" + esc(author) + "</dc:creator><dc:language>" + lang + "</dc:language></metadata><manifest>" + manifest.join("") +
    "</manifest><spine" + (nav === "ncx" ? ' toc="ncx"' : "") + ">" + files.map((f) => '<itemref idref="' + f.id + '"/>').join("") + "</spine></package>" });
  for (const f of files) {
    list.push({ name: "OEBPS/" + f.href, data: head + '<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + esc(f.title) +
      "</title></head><body>" + f.html + "</body></html>" });
  }
  return makeZip(list);
}
