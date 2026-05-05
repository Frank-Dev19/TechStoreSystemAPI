import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DocumentTypeKind } from '../entities/document-type-kind.enum';

export class CreateDocumentTypeDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsNumber()
  @IsOptional()
  digits: number;

  @IsString()
  @MaxLength(255)
  description: string;

  @IsEnum(DocumentTypeKind)
  kind: DocumentTypeKind;
}
