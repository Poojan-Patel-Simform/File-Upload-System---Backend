import { type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { type SignCloudinaryUploadBody } from "../schemas/cloudinary.schema.js";
import "dotenv/config";

export const signCloudinaryUploadService = async (
  req: Request,
  res: Response,
) => {
  try {
    const { publicId } = req.body as SignCloudinaryUploadBody;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Cloudinary environment variables are not configured");
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Unlike S3 presigned URLs, which are generated per-part, Cloudinary signs
    // the upload session as a whole: the same signature + timestamp pair is
    // reused for every chunk sent under this publicId, not regenerated per chunk.
    const signature = createHash("sha1")
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");

    return res.status(200).json({
      success: true,
      data: {
        cloudName,
        apiKey,
        timestamp,
        signature,
        publicId,
      },
    });
  } catch (error) {
    console.error("signCloudinaryUpload error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
