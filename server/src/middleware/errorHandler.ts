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
  // Common database errors are the caller's input, not a server fault.
  const mongoCode = (err as { code?: unknown }).code;
  const statusCode =
    err.statusCode ??
    (mongoCode === 11000
      ? 409
      : err.name === "CastError" || err.name === "ValidationError"
        ? 400
        : 500);
  if (statusCode >= 500) console.error(err.stack || err.message);

  const message =
    statusCode >= 500
      ? "Internal server error"
      : statusCode === 409 && mongoCode === 11000
        ? "That already exists"
        : err.name === "CastError"
          ? "Invalid id"
          : err.message;

  res.status(statusCode).json({ message });
};

export default errorHandler;
