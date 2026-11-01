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
