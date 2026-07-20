import { S3Client } from "@aws-sdk/client-s3";

import { serverEnv } from "@/lib/env";

export const s3Client = new S3Client({
  region: serverEnv.S3_REGION,
  endpoint: serverEnv.S3_ENDPOINT,
  credentials: {
    accessKeyId: serverEnv.S3_ACCESS_KEY_ID,
    secretAccessKey: serverEnv.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export const s3BucketName = serverEnv.S3_BUCKET_NAME;
export const s3PublicBaseUrl = serverEnv.S3_PUBLIC_BASE_URL;
