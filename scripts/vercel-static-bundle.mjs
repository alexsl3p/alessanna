/**
 * Utility script: copies public landing page static files to vercel-static-out/.
 * Use build-all.mjs for the full Vercel production build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "vercel-static-out");

const ROOT_FILES = [
  "index.html",
  "ru.html",
  "styles.css",
  "script.js",
  "translations.js",
];

function rmOut() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
}

function copyFile(rel) {
  const from = path.join(root, rel);
  const to = path.join(out, rel);
  if (!fs.existsSync(from)) {
    console.warn(`Optional skip: ${rel}`);
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(rel) {
  const from = path.join(root, rel);
  const to = path.join(out, rel);
  if (!fs.existsSync(from)) {
    console.warn(`Optional skip dir: ${rel}`);
    return;
  }
  fs.cpSync(from, to, { recursive: true });
}

rmOut();

for (const f of ROOT_FILES) {
  copyFile(f);
}

copyDir("locales");
copyDir("assets");

for (const f of [
  "supabase-public-config.js",
  "site-services.mjs",
  "site-team.mjs",
  "site-builder.mjs",
]) {
  copyFile(f);
}

console.log("vercel-static-out ready:", out);
