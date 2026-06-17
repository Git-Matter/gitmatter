import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv, requireEnv } from "./config.js";

// Object storage. S3-compatible only — Cloudflare R2 (prod) or any S3 endpoint;
// only the env vars change, never the code. S3 is required (no local fallback):
// configure S3_ENDPOINT / S3_REGION / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET.

let cachedClient: S3Client | null = null;

export function s3(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: requireEnv("S3_REGION"),
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY"),
      secretAccessKey: requireEnv("S3_SECRET_KEY"),
    },
    forcePathStyle: getEnv("S3_FORCE_PATH_STYLE") === "true",
  });
  return cachedClient;
}

function bucket(): string {
  return requireEnv("S3_BUCKET");
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

export async function putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body as PutObjectCommandInput["Body"],
      ContentType: contentType,
    })
  );
}

export async function getObject(key: string): Promise<Uint8Array> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return res.Body!.transformToByteArray();
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
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
export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn,
  });
}

export async function presignPut(
  key: string,
  contentType?: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn }
  );
}
