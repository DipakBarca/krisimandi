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
  Matches,
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

export const LISTING_SORTS = ['newest', 'price_asc', 'price_desc', 'nearest', 'ending_soon'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export class ListListingsQuery {
  /** Free text matched against the crop name (Nepali or English), variety and village. */
  @IsOptional()
  @IsString()
  @Length(1, 60)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cropId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  wardId?: number;

  @IsOptional()
  @IsEnum(SaleMode)
  saleMode?: SaleMode;

  /** Price per unit in NPR: the fixed price, or an auction's start price. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  /** The buyer's position, for distances, the radius filter and nearest-first sorting. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  radiusKm?: number;

  @IsOptional()
  @IsIn(LISTING_SORTS)
  sort?: ListingSort;

  @IsOptional()
  @IsIn(['ACTIVE', 'SOLD', 'EXPIRED'])
  status?: 'ACTIVE' | 'SOLD' | 'EXPIRED';

  /** Opaque paging token from the previous page's nextCursor. */
  @IsOptional()
  @Matches(/^\d{1,6}$/)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateAlertDto {
  @IsInt()
  cropId: number;

  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  maxPrice?: number;
}
