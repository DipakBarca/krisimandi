import { ComplaintStatus, ComplaintTarget } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateComplaintDto {
  @IsEnum(ComplaintTarget)
  targetType: ComplaintTarget;

  @IsUUID()
  targetId: string;

  @IsString()
  @Length(10, 1000)
  reason: string;
}

export class ComplaintsQuery {
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;
}

export class UpdateComplaintDto {
  @IsEnum(ComplaintStatus)
  status: ComplaintStatus;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  adminNotes?: string;
}
