# chunk-uploader

`chunk-uploader` is a TypeScript/JavaScript library for uploading large files in chunks with Redis-backed tracking and queue-based processing. It provides resumable, reliable uploads with support for S3-compatible storage backends like MinIO and AWS S3.

## Features

- **Chunked Upload**: Break large files into manageable chunks for reliable transfer
- **Resumable Uploads**: Redis-backed chunk tracking allows resuming interrupted uploads
- **Queue-Based Processing**: Background processing with BullMQ for scalability
- **S3-Compatible Storage**: Works with MinIO, AWS S3, and other S3-compatible services
- **TypeScript Support**: Full type safety and IntelliSense support
- **Configurable Retry Logic**: Built-in retry mechanism for failed uploads
- **Automatic Cleanup**: Redis chunks are automatically cleaned up after successful uploads

## Installation

```bash
npm install chunk-uploader
# or
yarn add chunk-uploader
# or
bun install chunk-uploader
```

## Quick Start

```ts
import { createPhotoUploader } from "chunk-uploader";

const uploader = createPhotoUploader({
  redis: {
    host: "localhost",
    port: 6379,
  },
  s3Client: yourS3Client, // Bun.S3Client instance
  storage: {
    bucketName: "my-uploads",
    endpoint: "http://localhost:9000", // MinIO endpoint
  },
  queueName: "file_uploads", // Optional: defaults to "uploads"
  logger: true, // Optional: enable logging
});

// Upload a file chunk
const result = await uploader.updatePhoto({
  photo: "base64-encoded-chunk-data",
  chunkIndex: 0,
  totalChunks: 5,
  photoId: "unique-file-identifier",
  directory: "user-uploads/2024",
  extension: "jpg",
});

console.log(result);
// Partial upload: { status: "partial", receivedChunks: 1, totalChunks: 5, url: null }
// Complete upload: { status: "complete", receivedChunks: 5, totalChunks: 5, url: "http://..." }
```

## Configuration

### UploaderConfig

```ts
type UploaderConfig = {
  logger?: boolean; // Enable/disable console logging
  redis: {
    host: string;
    port: number;
  };
  storage: {
    endpoint: string; // Storage service endpoint
    bucketName: string; // Storage bucket name
  };
  s3Client?: Bun.S3Client; // S3-compatible client instance
  queueName?: string; // BullMQ queue name (default: "uploads")
};
```

### UploadPhotoSchema

```ts
type UploadPhotoSchema = {
  photo: string; // Base64 encoded chunk data
  chunkIndex: number; // Current chunk index (0-based)
  totalChunks: number; // Total number of chunks
  photoId: string; // Unique identifier for the entire file
  directory: string; // Target directory path
  extension: string; // File extension (without dot)
};
```

## Complete Example with Elysia

```ts
import { Elysia } from "elysia";
import { createPhotoUploader } from "chunk-uploader";
import { S3Client } from "@aws-sdk/client-s3";
import { cors } from "@elysiajs/cors";

// Initialize S3 client (example with MinIO)
const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  region: "us-east-1",
  forcePathStyle: true,
});

// Create uploader instance
const uploader = createPhotoUploader({
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  s3Client,
  queueName: "image_uploads",
  storage: {
    bucketName: process.env.STORAGE_BUCKET_NAME!,
    endpoint: process.env.STORAGE_ENDPOINT!,
  },
  logger: true,
});

const app = new Elysia()
  .use(cors())
  .post("/upload-chunk", async ({ body, set }) => {
    const result = await uploader.updatePhoto(body as UploadPhotoSchema);

    if (result.status === "complete") {
      return {
        success: true,
        message: "File upload completed",
        data: result,
      };
    } else {
      return {
        success: true,
        message: `Chunk ${result.receivedChunks}/${result.totalChunks} received`,
        data: result,
      };
    }
  })
  .listen(3000);

console.log(`🚀 Upload API running on port ${app.server?.port}`);
```
