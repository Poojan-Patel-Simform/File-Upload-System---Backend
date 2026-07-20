import { Router } from "express";
import { signCloudinaryUpload } from "../controllers/cloudinary.controller.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { signCloudinaryUploadBodySchema } from "../schemas/cloudinary.schema.js";

const cloudinaryRouter = Router();

cloudinaryRouter.post(
  "/sign",
  validateBody(signCloudinaryUploadBodySchema),
  signCloudinaryUpload,
);

export default cloudinaryRouter;
