import { UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { config } from '../config';

/** Accepts one file in the multipart field `file`, kept in memory, up to the upload size limit. */
export const SingleUpload = () =>
  UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: config.maxUploadBytes } }),
  );
