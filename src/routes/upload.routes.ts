import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  initUpload,
  chunkFileUpload,
  singleFileUpload,
  getUploadStatus,
  abortUpload,
} from "../controllers/upload.controller.js";
import {
  singleFileUploadMiddleware,
  chunkUploadMiddleware,
} from "../middlewares/multer.middleware.js";
import { verifyContentType } from "../middlewares/contentType.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import {
  initUploadBodySchema,
  chunkUploadBodySchema,
} from "../schemas/upload.schema.js";

const uploadRouter = Router();

const initLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message:
    "Too many upload-init requests from this IP, please try again later",
});

const singleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many upload requests from this IP, please try again later",
});

const chunkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many chunk upload requests from this IP, please slow down",
});

uploadRouter.post(
  "/init",
  initLimiter,
  validateBody(initUploadBodySchema),
  initUpload,
);

uploadRouter.post(
  "/single",
  singleLimiter,
  singleFileUploadMiddleware,
  verifyContentType,
  singleFileUpload,
);

uploadRouter.post(
  "/chunk",
  chunkLimiter,
  chunkUploadMiddleware,
  validateBody(chunkUploadBodySchema),
  chunkFileUpload,
);

uploadRouter.get("/:uploadId/status", getUploadStatus);

uploadRouter.delete("/:uploadId", abortUpload);

export default uploadRouter;
