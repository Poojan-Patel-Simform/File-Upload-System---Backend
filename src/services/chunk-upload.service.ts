import { type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import path from "node:path";
import { CHUNK_DIR, MERGED_DIR } from "../constants.js";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "fs/promises";

export const chunkUploadService = async (req: Request, res: Response) => {
  try {
    const { uploadId, chunkIndex, checksum } = req.body;
    const file = req.file as Express.Multer.File | undefined;

    if (!uploadId || chunkIndex === undefined || chunkIndex === null) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
        error: "Bad request",
      });
    }

    const parsedChunkIndex = Number(chunkIndex);
    if (!Number.isInteger(parsedChunkIndex) || parsedChunkIndex < 0) {
      return res.status(400).json({
        success: false,
        message: "chunkIndex must be a non-negative integer",
        error: "Bad request",
      });
    }

    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No chunk data received",
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

    if (parsedChunkIndex >= upload.totalChunks) {
      return res.status(400).json({
        success: false,
        message: `chunkIndex ${parsedChunkIndex} is out of range (totalChunks: ${upload.totalChunks})`,
        error: "Bad request",
      });
    }

    if (upload.status === "COMPLETED") {
      return res.status(200).json({
        success: true,
        data: {
          status: upload.status,
          uploadId: upload.id,
          deduplicated: true,
        },
      });
    }

    if (upload.status === "MERGING") {
      return res.status(409).json({
        success: false,
        message: "Upload is currently being finalized, please retry shortly",
        error: "Conflict",
      });
    }

    if (upload.status === "FAILED") {
      return res.status(409).json({
        success: false,
        message:
          "Upload previously failed, re-initialize before uploading chunks",
        error: "Conflict",
      });
    }

    if (checksum) {
      const computedChunkHash = createHash("sha256")
        .update(file.buffer)
        .digest("hex");

      if (computedChunkHash !== checksum) {
        return res.status(400).json({
          success: false,
          message: `Checksum mismatch for chunk ${parsedChunkIndex}: expected ${checksum}, got ${computedChunkHash}`,
          error: "Bad request",
        });
      }
    }

    const uploadDir = path.join(CHUNK_DIR, uploadId);
    const chunkPath = path.join(uploadDir, String(parsedChunkIndex));

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(chunkPath, file.buffer);

    const existingChunk = await prisma.uploadChunk.findUnique({
      where: {
        uploadId_chunkIndex: { uploadId, chunkIndex: parsedChunkIndex },
      },
    });

    const checksumValue: string | null = checksum || null;

    let updatedUpload = await prisma.$transaction(async (tx) => {
      if (!existingChunk) {
        await tx.uploadChunk.create({
          data: {
            uploadId,
            chunkIndex: parsedChunkIndex,
            checksum: checksumValue,
          },
        });
      } else {
        await tx.uploadChunk.update({
          where: {
            uploadId_chunkIndex: { uploadId, chunkIndex: parsedChunkIndex },
          },
          data: { uploadedAt: new Date(), checksum: checksumValue },
        });
      }

      return tx.upload.update({
        where: { id: uploadId },
        data: {
          status: "UPLOADING",
          ...(existingChunk ? {} : { uploadedChunks: { increment: 1 } }),
        },
      });
    });

    const isLastChunk =
      updatedUpload.uploadedChunks === updatedUpload.totalChunks;

    if (!isLastChunk) {
      return res.status(200).json({
        success: true,
        data: {
          status: updatedUpload.status,
          uploadId: updatedUpload.id,
          chunkIndex: parsedChunkIndex,
          uploadedChunks: updatedUpload.uploadedChunks,
          totalChunks: updatedUpload.totalChunks,
          isComplete: false,
        },
      });
    }

    const allChunks = await prisma.uploadChunk.findMany({
      where: { uploadId },
      select: { chunkIndex: true },
    });

    const uploadedIndices = new Set(allChunks.map((c) => c.chunkIndex));
    const missing: number[] = [];
    for (let i = 0; i < updatedUpload.totalChunks; i++) {
      if (!uploadedIndices.has(i)) missing.push(i);
    }

    if (missing.length > 0) {
      return res.status(200).json({
        success: true,
        data: {
          status: updatedUpload.status,
          uploadId: updatedUpload.id,
          chunkIndex: parsedChunkIndex,
          uploadedChunks: updatedUpload.uploadedChunks,
          totalChunks: updatedUpload.totalChunks,
          isComplete: false,
          warning: `Chunk count matched but indices ${missing.join(", ")} are missing`,
        },
      });
    }

    const { count: claimedMerge } = await prisma.upload.updateMany({
      where: { id: uploadId, status: "UPLOADING" },
      data: { status: "MERGING" },
    });

    if (claimedMerge === 0) {
      return res.status(200).json({
        success: true,
        data: {
          status: "MERGING",
          uploadId: updatedUpload.id,
          chunkIndex: parsedChunkIndex,
          uploadedChunks: updatedUpload.uploadedChunks,
          totalChunks: updatedUpload.totalChunks,
          isComplete: false,
          message: "Merge already in progress",
        },
      });
    }

    const mergedFileDir = path.join(MERGED_DIR, uploadId);
    const mergedPath = path.join(mergedFileDir, upload.fileName);

    try {
      await fs.mkdir(mergedFileDir, { recursive: true });

      const hash = createHash("sha256");
      const writeStream = createWriteStream(mergedPath);

      for (let i = 0; i < updatedUpload.totalChunks; i++) {
        const chunkBuffer = await fs.readFile(path.join(uploadDir, String(i)));

        hash.update(chunkBuffer);

        await new Promise<void>((resolve, reject) => {
          writeStream.write(chunkBuffer, (err) =>
            err ? reject(err) : resolve(),
          );
        });
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end((err: unknown) => (err ? reject(err) : resolve()));
      });

      const computedHash = hash.digest("hex");

      if (computedHash !== upload.fileHash) {
        throw new Error(
          `Hash mismatch after merge: expected ${upload.fileHash}, got ${computedHash}`,
        );
      }

      await fs.rm(uploadDir, { recursive: true, force: true });

      const completed = await prisma.upload.update({
        where: { id: uploadId },
        data: { status: "COMPLETED" },
      });

      return res.status(200).json({
        success: true,
        data: {
          status: completed.status,
          uploadId: completed.id,
          chunkIndex: parsedChunkIndex,
          uploadedChunks: completed.uploadedChunks,
          totalChunks: completed.totalChunks,
          isComplete: true,
          filePath: mergedPath,
        },
      });
    } catch (mergeError) {
      console.error("uploadChunk merge error:", mergeError);

      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: "FAILED" },
      });

      await fs
        .rm(mergedFileDir, { recursive: true, force: true })
        .catch(() => {});

      return res.status(500).json({
        success: false,
        message: "Failed to merge chunks into final file",
        error:
          mergeError instanceof Error ? mergeError.message : "Unknown error",
      });
    }
  } catch (error) {
    console.error("uploadChunk error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
