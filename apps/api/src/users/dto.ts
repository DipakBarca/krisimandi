import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  fullName?: string;

  // Users choose Farmer, Buyer or both; Admin is granted by staff only.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(['FARMER', 'BUYER'], { each: true })
  roles?: ('FARMER' | 'BUYER')[];

  @IsOptional()
  @IsIn(['ne', 'en'])
  preferredLang?: 'ne' | 'en';

  @IsOptional()
  @IsInt()
  wardId?: number;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  village?: string;
}
