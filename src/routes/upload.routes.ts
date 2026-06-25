import { Router } from "express";
import { initUpload, uploadChunk } from "../controllers/upload.controller.js";
import { multerMiddleware } from "../middlewares/multer.middleware.js";

const uploadRouter = Router();

uploadRouter.post("/init", initUpload);
uploadRouter.post("/chunk", multerMiddleware, uploadChunk);

export default uploadRouter;
