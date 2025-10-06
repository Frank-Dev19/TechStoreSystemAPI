import { IsArray, ArrayNotEmpty, IsNumber } from "class-validator";

export class BulkOperationsDto {
    @IsArray()
    @ArrayNotEmpty()
    @IsNumber({}, { each: true })
    ids: number[];
}
