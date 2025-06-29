export * from "./types";
import Redis from "ioredis";
import { UploadPhoto } from "./uploader";
import type { UploaderConfig } from "./types";

export const createPhotoUploader = (config: UploaderConfig) => {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
  });

  if (config.storage) {
    return new UploadPhoto(config, redis);
  }

  throw new Error("Storage configuration is required");
};
