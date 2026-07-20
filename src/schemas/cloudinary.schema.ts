import { z } from "zod";

export const signCloudinaryUploadBodySchema = z.object({
  publicId: z.string().min(1),
});

export type SignCloudinaryUploadBody = z.infer<
  typeof signCloudinaryUploadBodySchema
>;
