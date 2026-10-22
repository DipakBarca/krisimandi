import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleMode } from '@prisma/client';

export class AuctionConfigDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  startPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  reservePrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  minIncrement: number;

  @IsDateString()
  endsAt: string;
}

class ListingFieldsDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  variety?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  grade?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  village?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}

export class CreateListingDto extends ListingFieldsDto {
  @IsInt()
  cropId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity: number;

  @IsInt()
  unitId: number;

  @IsEnum(SaleMode)
  saleMode: SaleMode;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  pricePerUnit?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AuctionConfigDto)
  auction?: AuctionConfigDto;

  @IsDateString()
  harvestDate: string;

  @IsDateString()
  availableUntil: string;

  @IsInt()
  wardId: number;
}

export class UpdateListingDto extends ListingFieldsDto {
  @IsOptional()
  @IsDateString()
  availableUntil?: string;

  @IsOptional()
  @IsInt()
  wardId?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  pricePerUnit?: number;
}

export class RelistDto {
  @IsDateString()
  availableUntil: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity?: number;
}

export class ListListingsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cropId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;

  @IsOptional()
  @IsEnum(SaleMode)
  saleMode?: SaleMode;

  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'SOLD', 'EXPIRED'])
  status?: 'ACTIVE' | 'PAUSED' | 'SOLD' | 'EXPIRED';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
