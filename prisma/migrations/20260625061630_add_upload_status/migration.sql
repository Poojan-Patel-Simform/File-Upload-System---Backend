-- AlterEnum
ALTER TYPE "UploadStatus" ADD VALUE 'NEW';

-- AlterTable
ALTER TABLE "uploads" ALTER COLUMN "status" SET DEFAULT 'NEW';
