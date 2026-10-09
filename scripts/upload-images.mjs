// Uploads everything in public/img to ImageKit, keeping folder names (products/, brand/, banners/).
// Usage: node --env-file=.env.local scripts/upload-images.mjs
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const key = process.env.IMAGEKIT_PRIVATE_KEY;
if (!key) {
  console.error("IMAGEKIT_PRIVATE_KEY is not set. Add it to .env.local first.");
  process.exit(1);
}
const root = join(process.cwd(), "public", "img");

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(webp|jpe?g|png|avif|svg)$/i.test(e.name)) yield p;
  }
}

let n = 0;
for await (const file of walk(root)) {
  const rel = relative(root, file).split(sep);
  const fileName = rel.pop();
  const folder = "/" + rel.join("/");
  const form = new FormData();
  form.append("file", new Blob([await readFile(file)]), fileName);
  form.append("fileName", fileName);
  form.append("folder", folder);
  form.append("useUniqueFileName", "false");
  form.append("overwriteFile", "true");
  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(key + ":").toString("base64") },
    body: form,
  });
  if (!res.ok) {
    console.error(`✗ ${folder}/${fileName}: ${res.status} ${await res.text()}`);
    continue;
  }
  n++;
  console.log(`✓ ${folder}/${fileName}`);
}
console.log(`Uploaded ${n} images. Set NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT and restart the app.`);
