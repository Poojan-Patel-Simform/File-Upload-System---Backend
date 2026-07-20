import { type Request, type Response } from "express";
import { signCloudinaryUploadService } from "../services/cloudinary-sign.service.js";

const signCloudinaryUpload = async (req: Request, res: Response) => {
  await signCloudinaryUploadService(req, res);
};

export { signCloudinaryUpload };
