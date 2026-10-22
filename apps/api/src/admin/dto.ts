import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';

export class UsersQuery {
  @IsOptional()
  @IsString()
  @Length(0, 100)
  q?: string;
}

export class ReasonDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}

export const CROP_CATEGORIES = ['vegetable', 'fruit', 'grain', 'pulse', 'spice', 'other'] as const;

export class CreateCropDto {
  @IsString()
  @Length(1, 60)
  nameEn: string;

  @IsString()
  @Length(1, 60)
  nameNe: string;

  @IsIn(CROP_CATEGORIES)
  category: string;

  @IsInt()
  @IsPositive()
  defaultUnitId: number;
}

export class UpdateCropDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  nameNe?: string;

  @IsOptional()
  @IsIn(CROP_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  defaultUnitId?: number;
}

export class AuditQuery {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  entity?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  entityId?: string;

  /** Show entries older than this id, for paging back. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  before?: number;
}
