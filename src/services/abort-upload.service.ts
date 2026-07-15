import { type Request, type Response } from "express";
import path from "node:path";
import fs from "fs/promises";
import { prisma } from "../db/prisma.js";
import { CHUNK_DIR } from "../constants.js";

export const abortUploadService = async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;

    if (typeof uploadId !== "string") {
      return res.status(400).json({
        success: false,
        message: "uploadId must be a single path segment",
        error: "Bad request",
      });
    }

    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found",
        error: "Not found",
      });
    }

    if (upload.status === "COMPLETED") {
      return res.status(409).json({
        success: false,
        message: "Cannot abort an upload that has already completed",
        error: "Conflict",
      });
    }

    const uploadDir = path.join(CHUNK_DIR, upload.id);
    await fs.rm(uploadDir, { recursive: true, force: true });

    const aborted = await prisma.upload.update({
      where: { id: upload.id },
      data: { status: "FAILED" },
    });

    return res.status(200).json({
      success: true,
      data: {
        uploadId: aborted.id,
        status: aborted.status,
      },
    });
  } catch (error) {
    console.error("abortUpload error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
