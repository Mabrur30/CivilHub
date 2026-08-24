import { ErrorRequestHandler, NextFunction, Request, Response } from "express";

interface HttpError extends Error {
  statusCode?: number;
}

const errorHandler: ErrorRequestHandler = (
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  console.error(err.stack || err.message);

  const statusCode = err.statusCode ?? 500;
  const message = statusCode >= 500 ? "Internal server error" : err.message;

  res.status(statusCode).json({ message });
};

export default errorHandler;
