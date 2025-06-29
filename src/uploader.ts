import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import type { UploaderConfig, UploadPhotoQueuePayload, UploadPhotoSchema } from "./types";

export class UploadPhoto {
  private queue: Queue;

  constructor(private config: UploaderConfig, private readonly redis: Redis) {
    this.queueWorker();
    this.queue = new Queue(this.config.queueName || "uploads", {
      connection: {
        host: this.config.redis.host,
        port: this.config.redis.port,
      },
    });
  }

  private queueInitialization(payload: UploadPhotoQueuePayload) {
    return this.queue.add("upload_photo", payload, { attempts: 2 });
  }

  private queueWorker() {
    const worker = new Worker(
      this.config.queueName || "uploads",
      async (job) => {
        const buffer = Buffer.from(job.data.base64Data, "base64");
        this.config.s3Client
          ?.write(job.data.filePath, buffer)
          .then((res) => {
            this.config.logger?.info(`P H O T O - U P L O A D E D - S U C C E S S F U L L Y : ${job.data.filePath}`);
          })
          .catch((err) => {
            this.config.logger?.error(`Failed to upload photo: ${err.message}`);
          });
      },
      {
        connection: {
          host: this.config.redis.host,
          port: this.config.redis.port,
        },
        concurrency: 3,
      }
    );

    /*   worker.on("completed", (job) => {
      this.config.logger?.info(`Job ${job.id} completed successfully`);
    }); */

    worker.on("failed", (job: Job | undefined, err: Error) => {
      this.config.logger?.error(`Job ${job?.id} failed with error: ${err.message}`);
    });

    worker.on("ready", () => {
      this.config.logger?.info("Upload Worker is ready to process jobs");
    });
  }

  public async updatePhoto(data: UploadPhotoSchema) {
    const { photo, chunkIndex, totalChunks, photoId, directory, extension } = data;
    const { redis, storage } = this.config;

    const photoKey = `photo_chunks:${photoId}`;
    const chunkKey = `${photoKey}:${chunkIndex}`;
    const metaKey = `${photoKey}:meta`;

    // Store the current chunk in Redis
    await this.redis.setex(chunkKey, 3600, photo); // Expire in 1 hour

    // Store/update metadata
    await this.redis.setex(
      metaKey,
      3600,
      JSON.stringify({
        totalChunks,
        photoId,
        directory,
      })
    );

    // Check how many chunks we have
    const chunkKeys = await this.redis.keys(`${photoKey}:*`);
    const chunkCount = chunkKeys.filter((key) => !key.endsWith(":meta")).length;

    // Check if we have all chunks
    if (chunkCount === totalChunks) {
      const completeBase64Parts: string[] = [];

      // Retrieve all chunks in order
      for (let i = 0; i < totalChunks; i++) {
        const chunk = await this.redis.get(`${photoKey}:${i}`);
        if (!chunk) throw new Error(`Missing chunk ${i} for photo ${photoId}`);
        completeBase64Parts.push(chunk);
      }

      const completeBase64 = completeBase64Parts.join("");
      const fileName = `${photoId}.${extension}`;
      const filePath = `${directory}/${fileName}`;
      const fileUrl = `${storage?.endpoint}/${storage?.bucketName}/${filePath}`;

      let base64Data = completeBase64;
      if (completeBase64.includes(",")) base64Data = completeBase64.split(",")[1] ?? "";

      this.queueInitialization({ filePath, base64Data });

      // Clean up Redis chunks
      const keysToDelete = await this.redis.keys(`${photoKey}:*`);
      if (keysToDelete.length > 0) await this.redis.del(...keysToDelete);

      return {
        status: "complete",
        url: fileUrl,
        receivedChunks: totalChunks,
        totalChunks,
      };
    } else {
      return {
        status: "partial",
        url: null,
        receivedChunks: chunkCount,
        totalChunks: totalChunks,
      };
    }
  }
}
