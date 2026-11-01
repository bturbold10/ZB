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

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "dist");
const POSTS_DIR = path.join(ROOT, "posts");

// 1) dist/ бэлдэх
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const item of ["index.html", "admin", "uploads"]) {
  const src = path.join(ROOT, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, item), { recursive: true });
}

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
    const m = file.match(/^(.+)\.(mn|en)\.md$/);
    if (!m) continue;
    const [, slug, lang] = m;
    const { data, content } = matter(fs.readFileSync(path.join(POSTS_DIR, file), "utf8"));
    (bySlug[slug] ||= {})[lang] = { data, html: marked.parse(content || "") };
  }
}

const posts = [];
for (const [slug, v] of Object.entries(bySlug)) {
  const mn = v.mn || v.en, en = v.en || v.mn;   // англи хувилбар байхгүй бол монголыг харуулна
  if (!mn) continue;
  const d = mn.data;
  if (d.draft === true) continue;
  posts.push({
    id: slug,
    date: toDate(d.date),
    cat: d.category || "policy",
    cover: d.cover || "",
    featured: d.featured === true,
    title:   { mn: esc(mn.data.title), en: esc(en.data.title) },
    summary: { mn: esc(mn.data.summary), en: esc(en.data.summary) },
    body:    { mn: mn.html, en: en.html }
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
      title: { mn: esc(d.title), en: esc(d.title_en || "") }
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
      name: esc(d.name), name_en: esc(d.name_en || ""),
      aimag: esc(d.aimag || ""), soum: esc(d.soum || ""),
      status: ["done", "building", "planned"].includes(d.status) ? d.status : "planned",
      kind: esc(d.kind || ""),
      year: num(d.year), volume_m3: num(d.volume_m3), area_ha: num(d.area_ha),
      purposes: Array.isArray(d.purposes) ? d.purposes.map(esc) : [],
      partners: esc(d.partners || ""),
      lat: num(d.lat), lng: num(d.lng),
      photo: esc(d.photo || ""),
      source_url: /^https?:\/\//i.test(url) ? esc(url) : "",
      description: { mn: marked.parse(content || ""), en: d.description_en ? marked.parse(String(d.description_en)) : "" }
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
    program.note = esc(p.note || ""); program.note_en = esc(p.note_en || "");
    program.source_url = /^https?:\/\//i.test(p.source_url || "") ? esc(p.source_url) : "";
  } catch (e) { console.warn("data/lakes-program.json уншиж чадсангүй:", e.message); }
}
fs.writeFileSync(path.join(OUT, "lakes.json"), JSON.stringify({ program, lakes }));
console.log(`✓ ${lakes.length} нуур → dist/lakes.json`);
