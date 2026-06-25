import dotenv from "dotenv";
dotenv.config();
import app from "./app.js";

const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

process.on("unhandledRejection", () => {
  console.log("UNHANDLED REJECTION! 💥 Shutting down...");

  server.close(() => {
    process.exit(1);
  });
});
