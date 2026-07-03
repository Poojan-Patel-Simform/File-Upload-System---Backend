import { type Request, type Response } from "express";
import { chunkUploadService } from "../services/chunk-upload.service.js";
import { initUploadService } from "../services/init-upload.service.js";
import { singleFileUploadService } from "../services/single-file-upload.service.js";

const initUpload = async (req: Request, res: Response) => {
  await initUploadService(req, res);
};

const chunkFileUpload = async (req: Request, res: Response) => {
  await chunkUploadService(req, res);
};

const singleFileUpload = async (req: Request, res: Response) => {
  await singleFileUploadService(req, res);
};

export { initUpload, chunkFileUpload, singleFileUpload };
