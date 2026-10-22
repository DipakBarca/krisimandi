import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, normalize } from 'path';
import sharp from 'sharp';
import { config } from '../config';
import { badRequest } from '../common/errors';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

/**
 * Local-disk storage. Public files live under uploadDir/public and are served at /uploads;
 * private files (verification documents) are never served directly.
 * Swap for S3-compatible storage before production.
 */
@Injectable()
export class StorageService {
  private path(scope: 'public' | 'private', key: string) {
    const full = normalize(join(config.uploadDir, scope, key));
    if (!full.startsWith(normalize(join(config.uploadDir, scope)))) throw new Error('Bad storage key');
    return full;
  }

  private async write(scope: 'public' | 'private', key: string, data: Buffer) {
    const full = this.path(scope, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  /** Re-encodes an upload as WebP, at most 1280 px wide, with metadata (including GPS) stripped. */
  async saveImage(folder: string, file: Express.Multer.File) {
    if (!IMAGE_TYPES.includes(file.mimetype)) {
      throw badRequest('FILE_TYPE', 'Upload a JPEG, PNG, WebP or HEIC photo.');
    }
    let webp: Buffer;
    try {
      webp = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1280, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    } catch {
      throw badRequest('FILE_UNREADABLE', 'That photo could not be read.');
    }
    const key = `${folder}/${randomUUID()}.webp`;
    await this.write('public', key, webp);
    return `/uploads/${key}`;
  }

  async savePrivate(folder: string, file: Express.Multer.File) {
    if (!DOC_TYPES.includes(file.mimetype)) {
      throw badRequest('FILE_TYPE', 'Upload a photo or a PDF.');
    }
    const ext = file.mimetype === 'application/pdf' ? 'pdf' : 'bin';
    const key = `${folder}/${randomUUID()}.${ext}`;
    await this.write('private', key, file.buffer);
    return key;
  }

  readPrivate(key: string) {
    return readFile(this.path('private', key));
  }

  async removePublic(url: string) {
    await rm(this.path('public', url.replace(/^\/uploads\//, '')), { force: true });
  }
}
