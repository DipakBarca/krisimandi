import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  phone: string;

  @IsOptional()
  @IsIn(['ne', 'en'])
  lang?: 'ne' | 'en';
}

export class VerifyOtpDto {
  @IsString()
  phone: string;

  @Matches(/^\d{6}$/)
  code: string;
}

export class RefreshDto {
  @IsString()
  @Length(20, 200)
  refreshToken: string;
}
