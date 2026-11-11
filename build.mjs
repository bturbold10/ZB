// ============================================================
//  Сайт бүтээх скрипт. Netlify үүнийг автоматаар ажиллуулна.
//  1) Бүх файлыг dist/ хавтас руу хуулна
//  2) posts/*.mn.md, posts/*.en.md нийтлэлүүдийг уншиж,
//     dist/posts.json болгон нэгтгэнэ (сайт үүнийг уншдаг).
// ============================================================
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = path.dirname(new URL(import.meta.url).pathname);   // build.mjs агуулахын гадна талд байрлана
const OUT = path.join(ROOT, "dist");
const POSTS_DIR = path.join(ROOT, "posts");

// 1) dist/ бэлдэх
//    Бүх кодын файл агуулахын гадна талд байна; энд тэдгээрийг сайтын бүтэц рүү байрлуулна:
//      admin.html        → dist/admin/index.html
//      admin-config.yml  → dist/admin/config.yml
//      admin-logo.svg    → dist/admin/logo.svg
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "admin"), { recursive: true });
const place = [
  ["index.html", "index.html"],
  ["_headers", "_headers"],
  ["admin.html", "admin/index.html"],
  ["admin-config.yml", "admin/config.yml"],
  ["admin-logo.svg", "admin/logo.svg"],
];
for (const [from, to] of place) {
  const src = path.join(ROOT, from);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, to));
  else console.warn(`! ${from} олдсонгүй`);
}
if (fs.existsSync(path.join(ROOT, "uploads"))) fs.cpSync(path.join(ROOT, "uploads"), path.join(OUT, "uploads"), { recursive: true });

// 2) Нийтлэлүүд
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toDate = v => {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

const bySlug = {};
if (fs.existsSync(POSTS_DIR)) {
  for (const file of fs.readdirSync(POSTS_DIR)) {
    const m = file.match(/^(.+)\.(mn|en|hu)\.md$/);
    if (!m) continue;
    const [, slug, lang] = m;
    const { data, content } = matter(fs.readFileSync(path.join(POSTS_DIR, file), "utf8"));
    (bySlug[slug] ||= {})[lang] = { data, html: marked.parse(content || "") };
  }
}

const posts = [];
for (const [slug, v] of Object.entries(bySlug)) {
  const mn = v.mn || v.en, en = v.en || v.mn, hu = v.hu || v.en || v.mn;   // орчуулга байхгүй бол англи, тэгээд монголыг харуулна
  if (!mn) continue;
  const d = mn.data;
  if (d.draft === true) continue;
  posts.push({
    id: slug,
    date: toDate(d.date),
    cat: d.category || "policy",
    cover: d.cover || "",
    featured: d.featured === true,
    title:   { mn: esc(mn.data.title), en: esc(en.data.title), hu: esc(hu.data.title) },
    summary: { mn: esc(mn.data.summary), en: esc(en.data.summary), hu: esc(hu.data.summary) },
    body:    { mn: mn.html, en: en.html, hu: hu.html }
  });
}
posts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
// Онцлох нийтлэл олон бол хамгийн сүүлийнх нь л онцлогдоно
let seen = false;
for (const p of posts) { if (p.featured && seen) p.featured = false; if (p.featured) seen = true; }

fs.writeFileSync(path.join(OUT, "posts.json"), JSON.stringify(posts));
console.log(`✓ ${posts.length} нийтлэл → dist/posts.json`);

// 3) Хэвлэлд гарсан мэдээ: press/*.md → dist/press.json
const PRESS_DIR = path.join(ROOT, "press");
const press = [];
if (fs.existsSync(PRESS_DIR)) {
  for (const file of fs.readdirSync(PRESS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const { data: d } = matter(fs.readFileSync(path.join(PRESS_DIR, file), "utf8"));
    const url = String(d.url || "").trim();
    if (!/^https?:\/\//i.test(url) || !d.title) continue;
    let source = String(d.source || "").trim();
    if (!source) { try { source = new URL(url).hostname.replace(/^www\./, ""); } catch { source = ""; } }
    press.push({
      id: file.replace(/\.md$/, ""),
      date: toDate(d.date),
      source: esc(source),
      url: esc(url),
      title: { mn: esc(d.title), en: esc(d.title_en || ""), hu: esc(d.title_hu || "") }
    });
  }
}
press.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
fs.writeFileSync(path.join(OUT, "press.json"), JSON.stringify(press));
console.log(`✓ ${press.length} мэдээ → dist/press.json`);

// 4) 333 нуур: lakes/*.md + data/lakes-program.json → dist/lakes.json
const LAKES_DIR = path.join(ROOT, "lakes");
const lakes = [];
const num = v => (v === null || v === undefined || v === "" || isNaN(v)) ? null : Number(v);
if (fs.existsSync(LAKES_DIR)) {
  for (const file of fs.readdirSync(LAKES_DIR)) {
    if (!file.endsWith(".md")) continue;
    const { data: d, content } = matter(fs.readFileSync(path.join(LAKES_DIR, file), "utf8"));
    if (!d.name) continue;
    const url = String(d.source_url || "").trim();
    lakes.push({
      id: file.replace(/\.md$/, ""),
      name: esc(d.name), name_en: esc(d.name_en || ""), name_hu: esc(d.name_hu || ""),
      aimag: esc(d.aimag || ""), soum: esc(d.soum || ""), soum_en: esc(d.soum_en || ""), soum_hu: esc(d.soum_hu || ""),
      status: ["done", "building", "planned"].includes(d.status) ? d.status : "planned",
      kind: esc(d.kind || ""),
      year: num(d.year), volume_m3: num(d.volume_m3), area_ha: num(d.area_ha),
      purposes: Array.isArray(d.purposes) ? d.purposes.map(esc) : [],
      partners: esc(d.partners || ""), partners_en: esc(d.partners_en || ""), partners_hu: esc(d.partners_hu || ""),
      lat: num(d.lat), lng: num(d.lng), approx: d.approx === true,
      photo: esc(d.photo || ""),
      source_url: /^https?:\/\//i.test(url) ? esc(url) : "",
      description: { mn: marked.parse(content || ""), en: d.description_en ? marked.parse(String(d.description_en)) : "", hu: d.description_hu ? marked.parse(String(d.description_hu)) : "" }
    });
  }
}
const order = { done: 0, building: 1, planned: 2 };
lakes.sort((a, b) => order[a.status] - order[b.status] || (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));
let program = {};
const progFile = path.join(ROOT, "data", "lakes-program.json");
if (fs.existsSync(progFile)) {
  try {
    const p = JSON.parse(fs.readFileSync(progFile, "utf8"));
    for (const k of ["target", "sites_identified", "completed", "in_progress"]) program[k] = num(p[k]);
    program.as_of = toDate(p.as_of);
    program.note = esc(p.note || ""); program.note_en = esc(p.note_en || ""); program.note_hu = esc(p.note_hu || "");
    program.source_url = /^https?:\/\//i.test(p.source_url || "") ? esc(p.source_url) : "";
  } catch (e) { console.warn("data/lakes-program.json уншиж чадсангүй:", e.message); }
}
fs.writeFileSync(path.join(OUT, "lakes.json"), JSON.stringify({ program, lakes }));
console.log(`✓ ${lakes.length} нуур → dist/lakes.json`);

// 5) Зургийн цомог: gallery/*.md → dist/gallery.json
const GALLERY_DIR = path.join(ROOT, "gallery");
const albums = [];
if (fs.existsSync(GALLERY_DIR)) {
  for (const file of fs.readdirSync(GALLERY_DIR)) {
    if (!file.endsWith(".md")) continue;
    const { data: d, content } = matter(fs.readFileSync(path.join(GALLERY_DIR, file), "utf8"));
    const photos = (Array.isArray(d.photos) ? d.photos : [])
      .filter(p => p && p.image)
      .map(p => ({ src: esc(p.image), caption: esc(p.caption || "") }));
    if (!d.title || !photos.length) continue;
    albums.push({
      id: file.replace(/\.md$/, ""),
      title: { mn: esc(d.title), en: esc(d.title_en || ""), hu: esc(d.title_hu || "") },
      date: toDate(d.date),
      location: esc(d.location || ""),
      cover: esc(d.cover || ""),
      photos,
      description: { mn: content.trim() ? marked.parse(content) : "", en: d.description_en ? `<p>${esc(d.description_en)}</p>` : "", hu: d.description_hu ? `<p>${esc(d.description_hu)}</p>` : "" }
    });
  }
}
albums.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
fs.writeFileSync(path.join(OUT, "gallery.json"), JSON.stringify(albums));
console.log(`✓ ${albums.length} цомог → dist/gallery.json`);

// 6) «Би хэн бэ»: data/about.json → dist/about.json
let about = { intro: { mn: "", en: "", hu: "" }, photos: [] };
const aboutFile = path.join(ROOT, "data", "about.json");
if (fs.existsSync(aboutFile)) {
  try {
    const a = JSON.parse(fs.readFileSync(aboutFile, "utf8"));
    about.intro = { mn: a.intro_mn ? marked.parse(String(a.intro_mn)) : "", en: a.intro_en ? marked.parse(String(a.intro_en)) : "", hu: a.intro_hu ? marked.parse(String(a.intro_hu)) : "" };
    about.photos = (Array.isArray(a.photos) ? a.photos : []).filter(p => p && p.image)
      .map(p => ({ src: esc(p.image), caption: { mn: esc(p.caption || ""), en: esc(p.caption_en || ""), hu: esc(p.caption_hu || "") } }));
  } catch (e) { console.warn("data/about.json уншиж чадсангүй:", e.message); }
}
fs.writeFileSync(path.join(OUT, "about.json"), JSON.stringify(about));
console.log(`✓ «Би хэн бэ»: ${about.photos.length} зураг → dist/about.json`);

// 6б) Нүүр хэсгийн бичлэг: data/hero.json → dist/hero.json
let hero = { video: "", poster: "" };
const heroFile = path.join(ROOT, "data", "hero.json");
if (fs.existsSync(heroFile)) {
  try {
    const h = JSON.parse(fs.readFileSync(heroFile, "utf8"));
    hero = { video: esc(h.video || ""), poster: esc(h.poster || "") };
  } catch (e) { console.warn("data/hero.json уншиж чадсангүй:", e.message); }
}
fs.writeFileSync(path.join(OUT, "hero.json"), JSON.stringify(hero));
console.log(`✓ Нүүр хэсэг: ${hero.video ? "бичлэгтэй" : "бичлэггүй"} → dist/hero.json`);

// 7) Ном: books/*.md → dist/books.json
const BOOKS_DIR = path.join(ROOT, "books");
const books = [];
if (fs.existsSync(BOOKS_DIR)) {
  for (const file of fs.readdirSync(BOOKS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const { data: d, content } = matter(fs.readFileSync(path.join(BOOKS_DIR, file), "utf8"));
    if (!d.title) continue;
    const pdf = String(d.pdf || "").trim();
    let pdf_mb = null;
    if (pdf.startsWith("/")) {
      const local = path.join(ROOT, decodeURIComponent(pdf));
      if (fs.existsSync(local)) pdf_mb = Math.max(0.1, Math.round(fs.statSync(local).size / 1048576 * 10) / 10);
    }
    const buy = String(d.buy_url || "").trim();
    books.push({
      id: file.replace(/\.md$/, ""),
      title: { mn: esc(d.title), en: esc(d.title_en || ""), hu: esc(d.title_hu || "") },
      year: num(d.year), publisher: esc(d.publisher || ""), pages: num(d.pages), isbn: esc(d.isbn || ""),
      languages: Array.isArray(d.languages) ? d.languages.map(esc) : [],
      cover: esc(d.cover || ""), pdf: esc(pdf), pdf_mb,
      buy_url: /^https?:\/\//i.test(buy) ? esc(buy) : "",
      order: num(d.order),
      description: { mn: content.trim() ? marked.parse(content) : "", en: d.description_en ? marked.parse(String(d.description_en)) : "", hu: d.description_hu ? marked.parse(String(d.description_hu)) : "" }
    });
  }
}
books.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (b.year || 0) - (a.year || 0) || a.title.mn.localeCompare(b.title.mn));
fs.writeFileSync(path.join(OUT, "books.json"), JSON.stringify(books));
console.log(`✓ ${books.length} ном → dist/books.json`);
