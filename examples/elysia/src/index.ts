import { Elysia } from "elysia";
import { createPhotoUploader } from "../../../src/index";
import { minioClient } from "./minio";
import { cors } from "@elysiajs/cors";

const uploader = createPhotoUploader({
  redis: {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT!),
  },
  s3Client: minioClient,
  queueName: "image_uploads",
  storage: {
    bucketName: process.env.MINIO_BUCKET_NAME!,
    endpoint: process.env.MINIO_ENDPOINT!,
  },
});

const app = new Elysia()
  .use(cors({ origin: "*" }))
  .get("/", () => "Hello Elysia")
  .post("/upload-image", async ({ body }) => {
    const result = await uploader.updatePhoto(body as any);
    return {
      message: "Image uploaded successfully",
      data: result,
    };
  })
  .listen(13000);

console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`);
