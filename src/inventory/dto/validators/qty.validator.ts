// src/inventory/dto/validators/qty.validator.ts
import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { MovementTypeEnum } from '../movement.dto';

export function IsQtyValidForType(options?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isQtyValidForType',
            target: object.constructor,
            propertyName,
            options,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    const dto = args.object as any;
                    if (typeof value !== 'number' || Number.isNaN(value)) return false;

                    if (dto.type === MovementTypeEnum.ADJ) {
                        // Ajuste: puede ser negativa o positiva, pero NO 0
                        return value !== 0;
                    }
                    // IN/OUT: debe ser >= 0.0001
                    return value >= 0.0001;
                },
                defaultMessage(args: ValidationArguments) {
                    const dto = args.object as any;
                    return dto?.type === MovementTypeEnum.ADJ
                        ? 'qty must not be zero for ADJ'
                        : 'qty must not be less than 0.0001';
                },
            },
        });
    };
}
