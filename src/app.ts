import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import uploadRouter from "./routes/upload.routes.js";

const app = express();

//1. Security HTTP headers
app.use(helmet());

//2. CORS configuration
app.use(cors());

// 3. Limit repeated public API requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message:
    "Too many requests created from this IP, please try again after 15 minutes",
});
app.use("/api/", limiter);

// 4. Body Parser
app.use(express.json());

app.use("/api/uploads/", uploadRouter);

export default app;
