import { type Request, type Response } from "express";
import path from "node:path";
import { createHash } from "node:crypto";
import fs from "fs/promises";
import { TRADITIONAL_UPLOAD_DIR } from "../constants.js";
import { prisma } from "../db/prisma.js";

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

    const fileHash = createHash("sha256").update(file.buffer).digest("hex");

    const existing = await prisma.upload.findUnique({ where: { fileHash } });

    if (existing?.status === "COMPLETED") {
      return res.status(200).json({
        success: true,
        data: {
          uploadId: existing.id,
          fileName: existing.fileName,
          fileSize: Number(existing.fileSize),
          deduplicated: true,
        },
      });
    }

    const upload = await prisma.upload.upsert({
      where: { fileHash },
      update: {
        status: "COMPLETED",
        fileName: file.originalname,
        fileSize: BigInt(file.buffer.length),
        totalChunks: 1,
        uploadedChunks: 1,
      },
      create: {
        fileHash,
        fileName: file.originalname,
        fileSize: BigInt(file.buffer.length),
        totalChunks: 1,
        uploadedChunks: 1,
        status: "COMPLETED",
      },
    });

    const uploadDir = path.join(TRADITIONAL_UPLOAD_DIR, upload.id);
    const filePath = path.join(uploadDir, upload.fileName);

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(filePath, file.buffer);

    return res.status(200).json({
      success: true,
      data: {
        uploadId: upload.id,
        fileName: upload.fileName,
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
