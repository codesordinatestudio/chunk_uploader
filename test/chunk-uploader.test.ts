import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { createPhotoUploader } from "../src/index";
import type { UploaderConfig, UploadPhotoSchema } from "../src/types";

// Mock Redis and S3 client
class MockRedis {
  private store = new Map<string, string>();

  async setex(key: string, _ttl: number, value: string) {
    this.store.set(key, value);
  }

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async keys(pattern: string) {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/:/g, ":") + "$");
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  async del(...keys: string[]) {
    for (const key of keys) this.store.delete(key);
  }

  // Add missing Redis methods that might be used
  async exists(key: string) {
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key: string, _seconds: number) {
    return 1; // Mock success
  }
}

const mockS3Client = {
  write: mock().mockResolvedValue({ success: true }),
};

describe("chunk-uploader", () => {
  let uploader: ReturnType<typeof createPhotoUploader>;
  let redis: MockRedis;

  beforeAll(() => {
    redis = new MockRedis();
    uploader = createPhotoUploader({
      redis: { host: "localhost", port: 6379 },
      s3Client: mockS3Client as any,
      queueName: "test_uploads",
      storage: { endpoint: "http://localhost:9000", bucketName: "test-bucket" },
      logger: false,
    } as UploaderConfig);

    // Patch uploader's redis with our mock
    (uploader as any).redis = redis;
  });

  afterAll(() => {
    // Clear all mocks if needed
    mockS3Client.write.mockClear();
  });

  it("should store a single chunk and return partial status", async () => {
    const data: UploadPhotoSchema = {
      photo: "base64chunk1",
      chunkIndex: 0,
      totalChunks: 2,
      photoId: "photo1",
      directory: "uploads",
      extension: "jpg",
    };

    const result = await uploader.updatePhoto(data);

    expect(result.status).toBe("partial");
    expect(result.receivedChunks).toBe(1);
    expect(result.totalChunks).toBe(2);
    expect(result.url).toBeNull();
  });

  it("should assemble all chunks and return complete status", async () => {
    // Clear any existing data for photo2
    const existingKeys = await redis.keys("photo_chunks:photo2:*");
    if (existingKeys.length > 0) {
      await redis.del(...existingKeys);
    }

    // Add first chunk
    const result1 = await uploader.updatePhoto({
      photo: "base64chunk1",
      chunkIndex: 0,
      totalChunks: 2,
      photoId: "photo2",
      directory: "uploads",
      extension: "jpg",
    });

    expect(result1.status).toBe("partial");

    // Add second chunk
    const result2 = await uploader.updatePhoto({
      photo: "base64chunk2",
      chunkIndex: 1,
      totalChunks: 2,
      photoId: "photo2",
      directory: "uploads",
      extension: "jpg",
    });

    expect(result2.status).toBe("complete");
    expect(result2.receivedChunks).toBe(2);
    expect(result2.totalChunks).toBe(2);
    expect(result2.url).toContain("uploads/photo2.jpg");
  });

  it("should handle missing chunks gracefully", async () => {
    // Clear any existing data for photo3
    const existingKeys = await redis.keys("photo_chunks:photo3:*");
    if (existingKeys.length > 0) {
      await redis.del(...existingKeys);
    }

    // Add only the first chunk of a 2-chunk upload
    const result1 = await uploader.updatePhoto({
      photo: "base64chunk1",
      chunkIndex: 0,
      totalChunks: 2,
      photoId: "photo3",
      directory: "uploads",
      extension: "jpg",
    });

    expect(result1.status).toBe("partial");
    expect(result1.receivedChunks).toBe(1);
    expect(result1.totalChunks).toBe(2);

    // Verify that chunk 1 is missing and upload is not complete
    const chunkExists = await redis.get("photo_chunks:photo3:1");
    expect(chunkExists).toBeNull();
  });

  it("should handle duplicate chunks correctly", async () => {
    // Clear any existing data for photo4
    const existingKeys = await redis.keys("photo_chunks:photo4:*");
    if (existingKeys.length > 0) {
      await redis.del(...existingKeys);
    }

    // Add the same chunk twice
    const data: UploadPhotoSchema = {
      photo: "base64chunk1",
      chunkIndex: 0,
      totalChunks: 1,
      photoId: "photo4",
      directory: "uploads",
      extension: "jpg",
    };

    const result1 = await uploader.updatePhoto(data);
    const result2 = await uploader.updatePhoto(data);

    expect(result1.status).toBe("complete");
    expect(result2.status).toBe("complete");
    expect(result1.url).toBe(result2.url);
  });

  it("should clean up chunks after successful upload", async () => {
    // Clear any existing data for photo5
    const existingKeys = await redis.keys("photo_chunks:photo5:*");
    if (existingKeys.length > 0) {
      await redis.del(...existingKeys);
    }

    // Upload a complete single-chunk photo
    const result = await uploader.updatePhoto({
      photo: "base64chunk1",
      chunkIndex: 0,
      totalChunks: 1,
      photoId: "photo5",
      directory: "uploads",
      extension: "jpg",
    });

    expect(result.status).toBe("complete");
    expect(result.receivedChunks).toBe(1);
    expect(result.totalChunks).toBe(1);
    expect(result.url).toContain("uploads/photo5.jpg");

    // Check that chunks are cleaned up from Redis
    const remainingChunks = await redis.keys("photo_chunks:photo5:*");
    expect(remainingChunks.length).toBe(0);
  });

  it("should handle multi-chunk upload completion", async () => {
    // Clear any existing data for photo6
    const existingKeys = await redis.keys("photo_chunks:photo6:*");
    if (existingKeys.length > 0) {
      await redis.del(...existingKeys);
    }

    // Upload 3 chunks
    const results = [];
    for (let i = 0; i < 3; i++) {
      const result = await uploader.updatePhoto({
        photo: `base64chunk${i}`,
        chunkIndex: i,
        totalChunks: 3,
        photoId: "photo6",
        directory: "uploads",
        extension: "png",
      });
      results.push(result);
    }

    // First two should be partial
    expect(results[0]?.status).toBe("partial");
    expect(results[1]?.status).toBe("partial");

    // Last one should be complete
    expect(results[2]?.status).toBe("complete");
    expect(results[2]?.receivedChunks).toBe(3);
    expect(results[2]?.totalChunks).toBe(3);
    expect(results[2]?.url).toContain("uploads/photo6.png");

    // Verify chunks are cleaned up
    const remainingChunks = await redis.keys("photo_chunks:photo6:*");
    expect(remainingChunks.length).toBe(0);
  });
});
