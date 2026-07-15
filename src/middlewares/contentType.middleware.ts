import { type Request, type Response, type NextFunction } from "express";
import { fileTypeFromBuffer } from "file-type";

export const verifyContentType = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file || !file.buffer) return next();

  try {
    const detected = await fileTypeFromBuffer(file.buffer);

    if (detected && file.mimetype && detected.mime !== file.mimetype) {
      return res.status(400).json({
        success: false,
        message: `File content (${detected.mime}) does not match declared type (${file.mimetype})`,
        error: "Bad request",
      });
    }

    return next();
  } catch (error) {
    console.error("verifyContentType error:", error);
    return next();
  }
};
