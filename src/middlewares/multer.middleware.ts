import multer from "multer";

const storage = multer.memoryStorage();

const MB = 1024 * 1024;

export const singleFileUploadMiddleware = multer({
  storage,
  limits: { fileSize: 500 * MB },
}).single("file");

export const chunkUploadMiddleware = multer({
  storage,
  limits: { fileSize: 64 * MB },
}).single("file");
