#!/usr/bin/env node
// One-off: delete EVERY object in S3_BUCKET. Irreversible. Reads S3_* from .env.
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const need = (n: string): string => {
  const v = process.env[n];
  if (!v) throw new Error(`${n} not set`);
  return v;
};

const Bucket = need("S3_BUCKET");
const s3 = new S3Client({
  endpoint: need("S3_ENDPOINT"),
  region: need("S3_REGION"),
  credentials: {
    accessKeyId: need("S3_ACCESS_KEY"),
    secretAccessKey: need("S3_SECRET_KEY"),
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
});

let token: string | undefined;
let total = 0;
do {
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket, ContinuationToken: token }),
  );
  const objs = list.Contents ?? [];
  if (objs.length) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: objs.map((o) => ({ Key: o.Key! })) },
      }),
    );
    total += objs.length;
    console.log(`deleted ${total}…`);
  }
  token = list.IsTruncated ? list.NextContinuationToken : undefined;
} while (token);

console.log(`Done. Removed ${total} objects from ${Bucket}.`);
