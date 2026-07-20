import { z } from "zod";

export const initUploadBodySchema = z.object({
  fileHash: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z
    .union([z.string(), z.number()])
    .transform((val, ctx) => {
      try {
        return BigInt(val);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "fileSize must be a valid integer",
        });
        return z.NEVER;
      }
    }),
  totalChunks: z.number().int().positive(),
});

export type InitUploadBody = z.infer<typeof initUploadBodySchema>;

export const chunkUploadBodySchema = z.object({
  uploadId: z.string().min(1),
  chunkIndex: z.coerce.number().int().nonnegative(),
  checksum: z.string().min(1).optional(),
});

export type ChunkUploadBody = z.infer<typeof chunkUploadBodySchema>;
