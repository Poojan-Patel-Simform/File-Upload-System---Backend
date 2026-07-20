import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { MulterError } from "multer";
import uploadRouter from "./routes/upload.routes.js";
import cloudinaryRouter from "./routes/cloudinary.routes.js";

const app = express();

app.use(helmet());

app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message:
    "Too many requests created from this IP, please try again after 15 minutes",
});
app.use("/api/", limiter);

app.use(express.json());

app.use("/api/uploads/", uploadRouter);
app.use("/api/cloudinary/", cloudinaryRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    if (err instanceof MulterError) {
      return res.status(400).json({
        success: false,
        message: err.message,
        error: err.code,
      });
    }

    console.error("Unhandled error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  },
);

export default app;
