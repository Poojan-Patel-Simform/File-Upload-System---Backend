import { type Request, type Response } from "express";
import path from "node:path";
import fs from "fs/promises";
import { TRADITIONAL_UPLOAD_DIR } from "../constants.js";

export const singleFileUploadService = async (req: Request, res: Response) => {
  try {
    const file = req.file as Express.Multer.File | undefined;

    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No file received",
        error: "Bad request",
      });
    }

    await fs.mkdir(TRADITIONAL_UPLOAD_DIR, { recursive: true });

    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(TRADITIONAL_UPLOAD_DIR, fileName);

    await fs.writeFile(filePath, file.buffer);

    return res.status(200).json({
      success: true,
      data: {
        fileName,
        filePath,
        fileSize: file.buffer.length,
      },
    });
  } catch (error) {
    console.error("uploadSingle error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
