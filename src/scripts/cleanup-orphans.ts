import path from "node:path";
import fs from "fs/promises";
import { prisma } from "../db/prisma.js";
import { CHUNK_DIR } from "../constants.js";

const TTL_MS = 24 * 60 * 60 * 1000;

const cleanupOrphans = async () => {
  const cutoff = new Date(Date.now() - TTL_MS);

  const staleUploads = await prisma.upload.findMany({
    where: {
      status: { in: ["NEW", "UPLOADING", "FAILED"] },
      updatedAt: { lt: cutoff },
    },
  });

  console.log(
    `Found ${staleUploads.length} stale upload(s) untouched for over ${TTL_MS / (60 * 60 * 1000)}h.`,
  );

  for (const upload of staleUploads) {
    const uploadDir = path.join(CHUNK_DIR, upload.id);
    await fs.rm(uploadDir, { recursive: true, force: true });

    await prisma.upload.delete({ where: { id: upload.id } });

    console.log(
      `Deleted orphaned upload ${upload.id} ("${upload.fileName}", was ${upload.status}, last touched ${upload.updatedAt.toISOString()})`,
    );
  }

  console.log("Cleanup complete.");
};

cleanupOrphans()
  .catch((error) => {
    console.error("cleanup-orphans failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
