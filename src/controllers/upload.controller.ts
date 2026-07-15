import { type Request, type Response } from "express";
import { chunkUploadService } from "../services/chunk-upload.service.js";
import { initUploadService } from "../services/init-upload.service.js";
import { singleFileUploadService } from "../services/single-file-upload.service.js";
import { uploadStatusService } from "../services/upload-status.service.js";
import { abortUploadService } from "../services/abort-upload.service.js";

const initUpload = async (req: Request, res: Response) => {
  await initUploadService(req, res);
};

const chunkFileUpload = async (req: Request, res: Response) => {
  await chunkUploadService(req, res);
};

const singleFileUpload = async (req: Request, res: Response) => {
  await singleFileUploadService(req, res);
};

const getUploadStatus = async (req: Request, res: Response) => {
  await uploadStatusService(req, res);
};

const abortUpload = async (req: Request, res: Response) => {
  await abortUploadService(req, res);
};

export {
  initUpload,
  chunkFileUpload,
  singleFileUpload,
  getUploadStatus,
  abortUpload,
};
