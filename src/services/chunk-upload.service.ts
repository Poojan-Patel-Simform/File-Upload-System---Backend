import { type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import path from "node:path";
import { CHUNK_DIR, MERGED_DIR } from "../constants.js";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "fs/promises";

export const chunkUploadService = async (req: Request, res: Response) => {
  try {
    const { uploadId, chunkIndex } = req.body;
    const file = req.file as Express.Multer.File | undefined;

    // Validate required parameters
    if (!uploadId || chunkIndex === undefined || chunkIndex === null) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
        error: "Bad request",
      });
    }

    // Validate chunkIndex is a non-negative integer
    const parsedChunkIndex = Number(chunkIndex);
    if (!Number.isInteger(parsedChunkIndex) || parsedChunkIndex < 0) {
      return res.status(400).json({
        success: false,
        message: "chunkIndex must be a non-negative integer",
        error: "Bad request",
      });
    }

    // Validate that a file was uploaded
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No chunk data received",
        error: "Bad request",
      });
    }

    // Check if the upload exists and retrieve its details
    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });

    // Error if upload does not exist
    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Upload not found",
        error: "Not found",
      });
    }

    // Validate chunkIndex is within bounds
    if (parsedChunkIndex >= upload.totalChunks) {
      return res.status(400).json({
        success: false,
        message: `chunkIndex ${parsedChunkIndex} is out of range (totalChunks: ${upload.totalChunks})`,
        error: "Bad request",
      });
    }

    // If the upload is already completed, respond with deduplication info
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

    // If the upload is in the process of merging, respond with a conflict error
    if (upload.status === "MERGING") {
      return res.status(409).json({
        success: false,
        message: "Upload is currently being finalized, please retry shortly",
        error: "Conflict",
      });
    }

    // If the upload previously failed, respond with a conflict error and instruct the client to re-initialize
    if (upload.status === "FAILED") {
      return res.status(409).json({
        success: false,
        message:
          "Upload previously failed, re-initialize before uploading chunks",
        error: "Conflict",
      });
    }

    // Store the chunk in the filesystem
    const uploadDir = path.join(CHUNK_DIR, uploadId);
    const chunkPath = path.join(uploadDir, String(parsedChunkIndex));

    // Create the directory if it doesn't exist and write the chunk to disk
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(chunkPath, file.buffer);

    // Check if the chunk already exists in the database
    const existingChunk = await prisma.uploadChunk.findUnique({
      where: {
        uploadId_chunkIndex: { uploadId, chunkIndex: parsedChunkIndex },
      },
    });

    let updatedUpload = await prisma.$transaction(async (tx) => {
      // If the chunk doesn't exist, create a new record; if it does, update the timestamp
      if (!existingChunk) {
        await tx.uploadChunk.create({
          data: { uploadId, chunkIndex: parsedChunkIndex },
        });
      } else {
        await tx.uploadChunk.update({
          where: {
            uploadId_chunkIndex: { uploadId, chunkIndex: parsedChunkIndex },
          },
          data: { uploadedAt: new Date() },
        });
      }

      // Update the upload record: set status to UPLOADING and increment uploadedChunks if this is a new chunk
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

    // If this is not the last chunk, respond with the current status and uploaded chunks
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

    //  If this is the last chunk, verify that all chunks are present before merging
    const allChunks = await prisma.uploadChunk.findMany({
      where: { uploadId },
      select: { chunkIndex: true },
    });

    const uploadedIndices = new Set(allChunks.map((c) => c.chunkIndex));
    const missing: number[] = [];
    for (let i = 0; i < updatedUpload.totalChunks; i++) {
      if (!uploadedIndices.has(i)) missing.push(i);
    }

    // If there are missing chunks, respond with a warning and do not proceed to merge
    if (missing.length > 0) {
      // counter said complete but rows disagree (e.g. lost write) — don't merge
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

    // All chunks are present, proceed to merge the chunks into the final file
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "MERGING" },
    });

    // keep the original filename, but namespace by uploadId to avoid collisions
    const mergedFileDir = path.join(MERGED_DIR, uploadId);
    const mergedPath = path.join(mergedFileDir, upload.fileName);

    try {
      // Create the directory for the merged file if it doesn't exist
      await fs.mkdir(mergedFileDir, { recursive: true });

      // SHA256 of the reassembled file, computed incrementally as chunks are
      // read — this lets us verify the merge produced a byte-identical copy
      // of the original file, without holding the whole file in memory just
      // to hash it at the end.
      const hash = createHash("sha256");
      const writeStream = createWriteStream(mergedPath);

      // Read chunks back in order (0, 1, 2, ...) and write them sequentially
      // to the merged file. Order matters here — chunks must be concatenated
      // in the same order the client split them, or the result is garbage
      // even though every individual chunk is intact.
      for (let i = 0; i < updatedUpload.totalChunks; i++) {
        const chunkBuffer = await fs.readFile(path.join(uploadDir, String(i)));

        // Feed this chunk's bytes into the running hash before writing it out.
        // By the time the loop finishes, `hash` reflects the SHA256 of the
        // entire merged file, computed the same way the client computed it
        // over the original file before chunking.
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

      // Compare the hash of what we just assembled against the hash the client
      // sent in initUpload (computed from the original, unsplit file). This is
      // the only point in the pipeline where we actually confirm the merged
      // file is correct — a mismatch here means something went wrong during
      // chunking, transit, disk writes, or this merge step itself. Catching it
      // now (before COMPLETED + chunk cleanup) is the last chance to fail loudly
      // instead of silently committing a corrupted file.
      if (computedHash !== upload.fileHash) {
        throw new Error(
          `Hash mismatch after merge: expected ${upload.fileHash}, got ${computedHash}`,
        );
      }

      // Hash verified — safe to delete the source chunks now. After this point
      // there's no way to re-merge if something was wrong, so this only runs
      // once we've confirmed the merged file is correct.
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

      // Merge failed (hash mismatch, disk I/O error, etc.) — mark the upload
      // as FAILED rather than leaving it stuck in MERGING. Note: chunks are
      // still on disk at this point (we only delete them after a successful
      // hash check above), but the existing initUpload "Case 5: FAILED" logic
      // deletes chunks and resets to UPLOADING on retry rather than resuming
      // from where it left off.
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: "FAILED" },
      });

      // Best-effort cleanup of whatever partial merged file/folder exists —
      // don't let a half-written file linger in storage/merged after a failure.
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
