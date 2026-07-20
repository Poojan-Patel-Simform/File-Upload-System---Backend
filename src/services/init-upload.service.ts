import { type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import path from "node:path";
import { CHUNK_DIR } from "../constants.js";
import { createHash } from "node:crypto";
import fs from "fs/promises";
import { type InitUploadBody } from "../schemas/upload.schema.js";

export const initUploadService = async (req: Request, res: Response) => {
  try {
    const { fileHash, fileName, fileSize: parsedFileSize, totalChunks } =
      req.body as InitUploadBody;

    const existingUpload = await prisma.upload.findFirst({
      where: { fileHash },
      include: {
        chunks: {
          select: { chunkIndex: true, checksum: true },
        },
      },
    });

    if (!existingUpload) {
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

    if (existingUpload.status === "MERGING") {
      return res.status(409).json({
        success: false,
        message: "Upload is currently being finalized, please retry shortly",
        error: "Conflict",
      });
    }

    if (existingUpload.status === "FAILED") {
      const uploadDir = path.join(CHUNK_DIR, existingUpload.id);

      const chunkingMatches = existingUpload.totalChunks === totalChunks;

      let survivingIndices: number[] | null = null;
      let staleIndices: number[] = [];

      if (chunkingMatches) {
        try {
          await fs.access(uploadDir);

          const surviving: number[] = [];
          const stale: number[] = [];

          for (const chunk of existingUpload.chunks) {
            const chunkPath = path.join(uploadDir, String(chunk.chunkIndex));
            try {
              const stat = await fs.stat(chunkPath);
              if (stat.size === 0) {
                stale.push(chunk.chunkIndex);
                continue;
              }

              if (chunk.checksum) {
                const buffer = await fs.readFile(chunkPath);
                const actualChecksum = createHash("sha256")
                  .update(buffer)
                  .digest("hex");
                if (actualChecksum !== chunk.checksum) {
                  stale.push(chunk.chunkIndex);
                  continue;
                }
              }

              surviving.push(chunk.chunkIndex);
            } catch {
              stale.push(chunk.chunkIndex);
            }
          }

          survivingIndices = surviving;
          staleIndices = stale;
        } catch {
          survivingIndices = null;
        }
      }

      if (staleIndices.length > 0) {
        await prisma.uploadChunk.deleteMany({
          where: {
            uploadId: existingUpload.id,
            chunkIndex: { in: staleIndices },
          },
        });
      }

      if (survivingIndices !== null) {
        const resumed = await prisma.upload.update({
          where: { id: existingUpload.id },
          data: {
            status: "UPLOADING",
            uploadedChunks: survivingIndices.length,
            fileName,
            fileSize: parsedFileSize,
            totalChunks,
          },
        });

        return res.status(200).json({
          success: true,
          data: {
            status: resumed.status,
            uploadId: resumed.id,
            uploadedChunks: survivingIndices,
          },
        });
      }

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
