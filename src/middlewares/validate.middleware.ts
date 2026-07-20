import { type NextFunction, type Request, type Response } from "express";
import { type ZodType } from "zod";

export const validateBody =
  (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues.map((issue) => issue.message).join(", "),
        error: "Bad request",
      });
    }

    req.body = result.data;
    next();
  };
