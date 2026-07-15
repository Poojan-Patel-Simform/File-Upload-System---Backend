-- CreateEnum
CREATE TYPE "R2UploadStatus" AS ENUM ('NEW', 'UPLOADING', 'PAUSED', 'COMPLETING', 'COMPLETED', 'ABORTED', 'FAILED');

-- CreateTable
CREATE TABLE "r2_uploads" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mimeType" TEXT,
    "r2Key" TEXT NOT NULL,
    "r2UploadId" TEXT NOT NULL,
    "partSize" INTEGER NOT NULL,
    "totalParts" INTEGER NOT NULL,
    "uploadedParts" INTEGER NOT NULL DEFAULT 0,
    "status" "R2UploadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "r2_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "r2_upload_parts" (
    "uploadId" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "eTag" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "r2_upload_parts_pkey" PRIMARY KEY ("uploadId","partNumber")
);

-- CreateIndex
CREATE UNIQUE INDEX "r2_uploads_fileHash_key" ON "r2_uploads"("fileHash");

-- CreateIndex
CREATE INDEX "r2_upload_parts_uploadId_idx" ON "r2_upload_parts"("uploadId");

-- AddForeignKey
ALTER TABLE "r2_upload_parts" ADD CONSTRAINT "r2_upload_parts_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "r2_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
