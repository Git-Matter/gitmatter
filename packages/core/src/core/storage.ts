import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { tenants, type StorageRegion } from "@workspace/db/schema";
import { getEnv, requireEnv } from "./config.js";

// Object storage. S3-compatible only — Cloudflare R2 (prod) or any S3 endpoint;
// only the env vars change, never the code. S3 is required (no local fallback):
// configure S3_ENDPOINT / S3_REGION / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET.

type StorageTarget = { client: S3Client; bucket: string };

const targets = new Map<StorageRegion, StorageTarget>();
const tenantRegions = new Map<string, StorageRegion>();

function optionalCredentials(prefix: string) {
  const accessKeyId = getEnv(`${prefix}_ACCESS_KEY`);
  const secretAccessKey = getEnv(`${prefix}_SECRET_KEY`);
  if (!accessKeyId && !secretAccessKey) return undefined;
  if (!accessKeyId || !secretAccessKey)
    throw new Error(`${prefix}_ACCESS_KEY and ${prefix}_SECRET_KEY must be set together`);
  return { accessKeyId, secretAccessKey };
}

function target(region: StorageRegion): StorageTarget {
  const cached = targets.get(region);
  if (cached) return cached;

  const prefix = region === "legacy" ? "S3" : `S3_${region.toUpperCase()}`;
  const endpoint = getEnv(`${prefix}_ENDPOINT`);
  const credentials = optionalCredentials(prefix);
  const configured: StorageTarget = {
    bucket: requireEnv(`${prefix}_BUCKET`),
    client: new S3Client({
      region: requireEnv(`${prefix}_REGION`),
      ...(endpoint ? { endpoint } : {}),
      ...(credentials ? { credentials } : {}),
      forcePathStyle: getEnv(`${prefix}_FORCE_PATH_STYLE`) === "true",
    }),
  };
  targets.set(region, configured);
  return configured;
}

async function regionForTenant(tenantId: string): Promise<StorageRegion> {
  const cached = tenantRegions.get(tenantId);
  if (cached) return cached;
  const [row] = await db
    .select({ storageRegion: tenants.storageRegion })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!row) throw new Error("Tenant not found");
  if (!row.storageRegion) throw new Error("Choose a data region before storing documents");
  tenantRegions.set(tenantId, row.storageRegion);
  return row.storageRegion;
}

async function storage(tenantId: string): Promise<StorageTarget> {
  return target(await regionForTenant(tenantId));
}

// Tenant-scoped object key: tenantId/userId/matterId/artifactId[.ext | /v{n}.ext].
// Every artifact's bytes live under its tenant prefix so storage isolation mirrors
// the database tenant boundary and keys are no longer globally guessable.
// Keyed by tenant + user + artifact only — NOT by matter. A document can be
// linked into many matters (see matter_documents), so the bytes must not live
// under any single matter's prefix. Existing objects keep their old keys; the
// absolute path is persisted per version in document_versions.storagePath.
export function buildStoragePath(p: {
  tenantId: string;
  userId: string;
  artifactId: string;
  ext: string;
  version?: number;
}): string {
  const tail =
    p.version != null ? `${p.artifactId}/v${p.version}.${p.ext}` : `${p.artifactId}.${p.ext}`;
  return `${p.tenantId}/${p.userId}/${tail}`;
}

export async function putObject(
  tenantId: string,
  key: string,
  body: Buffer,
  contentType?: string
): Promise<void> {
  const { client, bucket } = await storage(tenantId);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body as PutObjectCommandInput["Body"],
      ContentType: contentType,
    })
  );
}

export async function getObject(tenantId: string, key: string): Promise<Uint8Array> {
  const { client, bucket } = await storage(tenantId);
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return res.Body!.transformToByteArray();
}

export async function deleteObject(tenantId: string, key: string): Promise<void> {
  const { client, bucket } = await storage(tenantId);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Is a storage error just "the object is already gone"? S3 reports a missing key
 * as 404 / NoSuchKey / NotFound. Treat those as success when deleting so a purge
 * stays idempotent and only genuine failures (perms, network, 5xx) are surfaced.
 */
export function isAlreadyDeleted(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.$metadata?.httpStatusCode === 404 || e?.name === "NoSuchKey" || e?.name === "NotFound";
}

// Presigned URL for direct client upload/download without proxying bytes through
// the app. `expiresIn` is seconds (default 1h).
export async function presignGet(tenantId: string, key: string, expiresIn = 3600): Promise<string> {
  const { client, bucket } = await storage(tenantId);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn,
  });
}

export async function presignPut(
  tenantId: string,
  key: string,
  contentType?: string,
  expiresIn = 3600
): Promise<string> {
  const { client, bucket } = await storage(tenantId);
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}
