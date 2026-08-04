import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EquipmentType, RequestOrigin, ServiceOrderPriority, ServiceType } from '../enums';
import { CreateServiceOrderAggregateDto } from './create-service-order-aggregate.dto';

describe('CreateServiceOrderAggregateDto', () => {
  const validPayload = {
    requestOrigin: RequestOrigin.CLIENT,
    clientId: 42,
    assignedToTechnicianId: 7,
    serviceType: ServiceType.DIAGNOSIS,
    items: [
      {
        equipmentType: EquipmentType.LAPTOP,
        brand: 'Lenovo',
        model: 'T14',
        serialNumber: ' SN-001 ',
        initialIssue: 'No enciende',
      },
    ],
  };

  it('acepta una cabecera con uno o más equipos sin repetir técnico ni tipo de servicio', async () => {
    const dto = plainToInstance(CreateServiceOrderAggregateDto, validPayload);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]).not.toHaveProperty('assignedToTechnicianId');
    expect(dto.items[0]).not.toHaveProperty('serviceType');
  });

  it('rechaza una orden sin equipos', async () => {
    const dto = plainToInstance(CreateServiceOrderAggregateDto, { ...validPayload, items: [] });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'items')).toBe(true);
  });

  it('rechaza un equipo sin problema inicial', async () => {
    const dto = plainToInstance(CreateServiceOrderAggregateDto, {
      ...validPayload,
      items: [{ equipmentType: EquipmentType.LAPTOP }],
    });

    const errors = await validate(dto);
    const itemErrors = errors.find((error) => error.property === 'items')?.children?.[0]?.children ?? [];

    expect(itemErrors.some((error) => error.property === 'initialIssue')).toBe(true);
  });

  it('normaliza prioridad baja por defecto y número de serie', () => {
    const dto = plainToInstance(CreateServiceOrderAggregateDto, validPayload);

    expect(dto.items[0].priority).toBe(ServiceOrderPriority.LOW);
    expect(dto.items[0].serialNumber).toBe('SN-001');
  });

  it('valida una cotización inicial anidada por equipo', async () => {
    const dto = plainToInstance(CreateServiceOrderAggregateDto, {
      ...validPayload,
      serviceType: ServiceType.STANDARD_SERVICE,
      items: [
        {
          ...validPayload.items[0],
          initialCommercial: {
            notes: 'Aprobado en recepción',
            lines: [
              { type: 'SERVICE', quantity: 1, unitPrice: 80 },
              { type: 'PRODUCT', productId: 12, quantity: 2, unitPrice: 25 },
            ],
          },
        },
      ],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.items[0].initialCommercial?.lines).toHaveLength(2);
  });

  it('rechaza una cotización inicial sin líneas', async () => {
    const dto = plainToInstance(CreateServiceOrderAggregateDto, {
      ...validPayload,
      serviceType: ServiceType.STANDARD_SERVICE,
      items: [{ ...validPayload.items[0], initialCommercial: { lines: [] } }],
    });

    const errors = await validate(dto);
    const itemErrors = errors.find((error) => error.property === 'items')?.children?.[0]?.children ?? [];

    expect(itemErrors.some((error) => error.property === 'initialCommercial')).toBe(true);
  });
});
