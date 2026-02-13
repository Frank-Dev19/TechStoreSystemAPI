// src/sales/validators/is-unique-document-series.validator.ts
import {
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
} from 'class-validator';
import { DocumentSeries } from '../entities/document-series.entity';

// Variable global para almacenar el servicio
let documentSeriesService: any;

@ValidatorConstraint({ name: 'isUniqueDocumentSeries', async: true })
export class IsUniqueDocumentSeries implements ValidatorConstraintInterface {
    constructor() {}

    async validate(code: string, args: ValidationArguments) {
        if (!code) return true; // Si no hay código, no validar
        
        if (!documentSeriesService) {
            console.error('❌ DocumentSeriesService no está inicializado');
            return false;
        }
        
        const dto = args.object as any;
        const { companyId, documentType, id } = dto;

        const existing = await documentSeriesService.findByCode(companyId, documentType, code);

        // Si no existe, es válido
        if (!existing) return true;
        
        // Si existe pero es el mismo registro (actualización), es válido
        if (id && existing.id === id) return true;
        
        // Si existe y es diferente registro, no es válido
        return false;
    }

    defaultMessage(args: ValidationArguments) {
        return `Ya existe una serie con el código "${args.value}" para este tipo de documento y empresa.`;
    }
}

// Función para inicializar el servicio
export function setDocumentSeriesService(service: any) {
    documentSeriesService = service;
}