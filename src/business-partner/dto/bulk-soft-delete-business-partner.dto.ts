import { ArrayNotEmpty, IsArray, IsNumber } from "class-validator";

export class BulkSoftDeleteBusinessPartnerDto {

    @ArrayNotEmpty()
    @IsArray()
    @IsNumber({}, { each: true })
    ids: number[];
}
