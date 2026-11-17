import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const root = resolve(process.cwd(), ".scratch/template-design-acceptance/object-store");
function pathFor(tenantId: string, key: string) {
  if (!key.startsWith(`${tenantId}/`)) throw new Error("Evidence storage tenant mismatch");
  const path = resolve(root, key);
  if (!path.startsWith(root + sep)) throw new Error("Evidence storage path rejected");
  return path;
}
export function buildStoragePath(p: {
  tenantId: string;
  userId: string;
  artifactId: string;
  ext: string;
  version?: number;
}) {
  const tail =
    p.version != null ? `${p.artifactId}/v${p.version}.${p.ext}` : `${p.artifactId}.${p.ext}`;
  return `${p.tenantId}/${p.userId}/${tail}`;
}
export async function putObject(tenantId: string, key: string, body: Buffer | Uint8Array) {
  const path = pathFor(tenantId, key);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, body, { flag: "wx", mode: 0o600 });
}
export async function getObject(tenantId: string, key: string) {
  try {
    return new Uint8Array(await readFile(pathFor(tenantId, key)));
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      const missing = new Error("Evidence object not found");
      missing.name = "NoSuchKey";
      throw missing;
    }
    throw error;
  }
}
export async function deleteObject(tenantId: string, key: string) {
  await unlink(pathFor(tenantId, key)).catch((error: { code?: string }) => {
    if (error.code !== "ENOENT") throw error;
  });
}
export function isAlreadyDeleted(error: unknown) {
  return (error as { name?: string })?.name === "NoSuchKey";
}
export async function presignGet(tenantId: string, key: string) {
  pathFor(tenantId, key);
  return `http://127.0.0.1:4295/api/evidence/object?tenantId=${encodeURIComponent(tenantId)}&key=${encodeURIComponent(key)}`;
}
export async function presignPut() {
  throw new Error("Direct upload is disabled in evidence adapter");
}
