import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitServiceOrderSurveyDto {
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating: number;

  @IsInt()
  @Min(1)
  @Max(5)
  attentionRating: number;

  @IsInt()
  @Min(1)
  @Max(5)
  serviceQualityRating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
