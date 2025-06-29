export type UploadPhotoSchema = {
  photo: string; // Base64 encoded photo chunk
  chunkIndex: number; // Index of the current chunk
  totalChunks: number; // Total number of chunks
  photoId: string; // Unique identifier for the photo
  directory: string; // Directory where the photo will be stored
  extension: string; // File extension of the photo
};

export type UploadPhotoQueuePayload = {
  filePath: string;
  base64Data: string;
};

export type UploaderConfig = {
  logger?: { info: (message: string) => void; error: (message: string) => void }; // Logger instance for logging messages,
  redis: {
    host: string;
    port: number;
  };
  storage: {
    endpoint: string; // Endpoint for the storage service (e.g., MinIO, AWS S3)
    bucketName: string; // Name of the bucket for storage
  };
  s3Client?: Bun.S3Client; // S3 client instance (e.g., MinIO, AWS S3)
  queueName?: string; // Name of the queue for uploads
};
