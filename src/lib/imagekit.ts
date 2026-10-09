import "server-only";
import crypto from "node:crypto";

// Server-side ImageKit helpers. No SDK needed: uploads go to the public REST API.
export const imagekitConfigured = () =>
  Boolean(process.env.IMAGEKIT_PRIVATE_KEY && process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY && process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT);

/** Signature the browser needs for a direct upload (https://imagekit.io/docs/api-reference/upload-file/upload-file#how-to-implement-client-side-file-upload). */
export function uploadAuth() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY!;
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 60 * 10;
  const signature = crypto.createHmac("sha1", privateKey).update(token + expire).digest("hex");
  return { token, expire, signature, publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY! };
}

/** Server-side upload of a file buffer into a folder; returns the stored path relative to the URL endpoint. */
export async function uploadBuffer(buf: Buffer, fileName: string, folder = "/products") {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)]), fileName);
  form.append("fileName", fileName);
  form.append("folder", folder);
  form.append("useUniqueFileName", "false");
  form.append("overwriteFile", "true");
  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(process.env.IMAGEKIT_PRIVATE_KEY + ":").toString("base64") },
    body: form,
  });
  if (!res.ok) throw new Error(`ImageKit upload failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { filePath: string };
  return json.filePath.replace(/^\//, "");
}
