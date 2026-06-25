-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADING', 'MERGING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "uploadedChunks" INTEGER NOT NULL DEFAULT 0,
    "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_chunks" (
    "uploadId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_chunks_pkey" PRIMARY KEY ("uploadId","chunkIndex")
);

-- CreateIndex
CREATE UNIQUE INDEX "uploads_fileHash_key" ON "uploads"("fileHash");

-- CreateIndex
CREATE INDEX "upload_chunks_uploadId_idx" ON "upload_chunks"("uploadId");

-- AddForeignKey
ALTER TABLE "upload_chunks" ADD CONSTRAINT "upload_chunks_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
