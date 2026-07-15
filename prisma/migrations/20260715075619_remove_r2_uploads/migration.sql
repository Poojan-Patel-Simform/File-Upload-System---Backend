/*
  Warnings:

  - You are about to drop the `r2_upload_parts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `r2_uploads` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "r2_upload_parts" DROP CONSTRAINT "r2_upload_parts_uploadId_fkey";

-- DropTable
DROP TABLE "r2_upload_parts";

-- DropTable
DROP TABLE "r2_uploads";

-- DropEnum
DROP TYPE "R2UploadStatus";
