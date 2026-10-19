import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * API errors carry a stable `code` the web app translates into Nepali or English,
 * plus an English `message` for developers.
 */
export class AppError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ statusCode: status, code, message }, status);
  }
}

export const badRequest = (code: string, message: string) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message);
export const forbidden = (code: string, message: string) =>
  new AppError(HttpStatus.FORBIDDEN, code, message);
export const notFound = (code: string, message: string) =>
  new AppError(HttpStatus.NOT_FOUND, code, message);
export const tooMany = (code: string, message: string) =>
  new AppError(HttpStatus.TOO_MANY_REQUESTS, code, message);
