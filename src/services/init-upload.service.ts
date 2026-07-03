import { type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import path from "node:path";
import { CHUNK_DIR } from "../constants.js";
import fs from "fs/promises";

export const initUploadService = async (req: Request, res: Response) => {
  try {
    const { fileHash, fileName, fileSize, totalChunks } = req.body;

    // Check if all required parameters are present and valid
    if (!fileHash || !fileName || !fileSize || !totalChunks) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
        error: "Bad request",
      });
    }

    // Validate totalChunks is a positive integer
    if (!Number.isInteger(totalChunks) || totalChunks <= 0) {
      return res.status(400).json({
        success: false,
        message: "totalChunks must be a positive integer",
        error: "Bad request",
      });
    }

    // Validate fileSize is a valid integer (can be large, so use BigInt)
    let parsedFileSize: bigint;
    try {
      parsedFileSize = BigInt(fileSize);
    } catch {
      return res.status(400).json({
        success: false,
        message: "fileSize must be a valid integer",
        error: "Bad request",
      });
    }

    // Check if an upload with the same fileHash already exists
    const existingUpload = await prisma.upload.findFirst({
      where: { fileHash },
      include: {
        chunks: {
          select: { chunkIndex: true },
        },
      },
    });

    // Case 1: brand new file
    if (!existingUpload) {
      // Create a new upload record in the database
      const upload = await prisma.upload.create({
        data: {
          fileHash,
          fileName,
          fileSize: parsedFileSize,
          totalChunks,
        },
      });

      return res.status(201).json({
        success: true,
        data: {
          status: upload.status,
          uploadId: upload.id,
          uploadedChunks: [],
        },
      });
    }

    // Case 2: already fully uploaded — dedupe, skip upload entirely
    if (existingUpload.status === "COMPLETED") {
      return res.status(200).json({
        success: true,
        data: {
          status: existingUpload.status,
          uploadId: existingUpload.id,
          deduplicated: true,
        },
      });
    }

    // Case 3: resume an in-progress upload
    if (existingUpload.status === "UPLOADING") {
      return res.status(200).json({
        success: true,
        data: {
          status: existingUpload.status,
          uploadId: existingUpload.id,
          uploadedChunks: existingUpload.chunks.map((c) => c.chunkIndex),
        },
      });
    }

    // Case 4: a merge/finalize is in progress — don't let the client interfere
    if (existingUpload.status === "MERGING") {
      return res.status(409).json({
        success: false,
        message: "Upload is currently being finalized, please retry shortly",
        error: "Conflict",
      });
    }

    // Case 5: previously failed — reset and let them restart
    if (existingUpload.status === "FAILED") {
      const uploadDir = path.join(CHUNK_DIR, existingUpload.id);
      await fs.rm(uploadDir, { recursive: true, force: true });

      await prisma.uploadChunk.deleteMany({
        where: { uploadId: existingUpload.id },
      });

      const restarted = await prisma.upload.update({
        where: { id: existingUpload.id },
        data: {
          status: "UPLOADING",
          uploadedChunks: 0,
          fileName,
          fileSize: parsedFileSize,
          totalChunks,
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          status: restarted.status,
          uploadId: restarted.id,
          uploadedChunks: [],
        },
      });
    }

    // Case 6: NEW status row exists but no chunks yet (created but client never started)
    return res.status(200).json({
      success: true,
      data: {
        status: existingUpload.status,
        uploadId: existingUpload.id,
        uploadedChunks: existingUpload.chunks.map((c) => c.chunkIndex),
      },
    });
  } catch (error) {
    console.error("uploadInit error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
