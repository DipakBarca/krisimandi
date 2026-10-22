import { IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Max, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateOfferDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  pricePerUnit: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity: number;

  @IsDateString()
  pickupDate: string;
}

/** A counter can change any of the terms; unchanged ones carry over. */
export class CounterOfferDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  pricePerUnit: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsDateString()
  pickupDate?: string;
}

export class OffersQuery {
  @IsOptional()
  @IsIn(['buying', 'selling'])
  side?: 'buying' | 'selling';
}

export class BidDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountPerUnit: number;
}

export class SendMessageDto {
  @IsString()
  @Length(1, 2000)
  body: string;
}

/** Pickup details either side can set while the order is open. */
export class PickupDto {
  @IsOptional()
  @IsDateString()
  pickupAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  pickupPlace?: string;
}

export class PaymentDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

export class CancelOrderDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  comment?: string;
}
