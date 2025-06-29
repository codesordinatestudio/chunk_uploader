import { S3Client } from "bun";

export const minioClient = new S3Client({
  accessKeyId: process.env.MINIO_ACCESS_KEY,
  secretAccessKey: process.env.MINIO_SECRET_KEY,
  bucket: process.env.MINIO_BUCKET_NAME,
  endpoint: process.env.MINIO_ENDPOINT,
  acl: "public-read",
});
