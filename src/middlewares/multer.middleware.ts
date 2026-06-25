import multer from "multer";

const storage = multer.memoryStorage();

export const multerMiddleware = multer({
  storage,
}).single("file");
