import { Router } from "express";
import {
  initUpload,
  chunkFileUpload,
  singleFileUpload,
} from "../controllers/upload.controller.js";
import { multerMiddleware } from "../middlewares/multer.middleware.js";

const uploadRouter = Router();

uploadRouter.post("/init", initUpload);
uploadRouter.post("/single", multerMiddleware, singleFileUpload);
uploadRouter.post("/chunk", multerMiddleware, chunkFileUpload);

export default uploadRouter;
