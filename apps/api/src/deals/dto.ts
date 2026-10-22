import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator';

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
