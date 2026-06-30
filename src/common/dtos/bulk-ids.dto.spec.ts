import 'reflect-metadata';
import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientController } from 'src/clients/client.controller';
import { ClientService } from 'src/clients/client.service';
import { DocumentTypesController } from 'src/catalogs/document-types/document-types.controller';
import { DocumentTypesService } from 'src/catalogs/document-types/document-types.service';
import { SupplierController } from 'src/suppliers/supplier.controller';
import { SupplierService } from 'src/suppliers/supplier.service';
import { BulkIdsDto } from './bulk-ids.dto';

describe('BulkIdsDto', () => {
  const validationPipe = new ValidationPipe({ transform: true, whitelist: true });
  const bodyMetadata: ArgumentMetadata = {
    type: 'body',
    metatype: BulkIdsDto,
    data: undefined,
  };

  it('transforms string ids into numbers and validates them', async () => {
    const dto = plainToInstance(BulkIdsDto, { ids: ['1', '2'] });

    const errors = await validate(dto);

    expect(dto.ids).toEqual([1, 2]);
    expect(errors).toHaveLength(0);
  });

  it('rejects empty arrays', async () => {
    const dto = plainToInstance(BulkIdsDto, { ids: [] });

    const errors = await validate(dto);

    expect(errors).not.toHaveLength(0);
  });

  it('rejects duplicate ids', async () => {
    const dto = plainToInstance(BulkIdsDto, { ids: [1, 1] });

    const errors = await validate(dto);

    expect(errors).not.toHaveLength(0);
  });

  it('rejects non-positive or non-integer ids', async () => {
    const dto = plainToInstance(BulkIdsDto, { ids: [1, 0, 1.5] });

    const errors = await validate(dto);

    expect(errors).not.toHaveLength(0);
  });

  it('transforms string ids before document types controller forwards bulk restore payloads', async () => {
    const service = {
      bulkRestore: jest.fn(),
    } as unknown as jest.Mocked<DocumentTypesService>;
    const controller = new DocumentTypesController(service);

    const dto = await validationPipe.transform({ ids: ['1', '2'] }, bodyMetadata);

    await controller.bulkRestore(dto);

    expect(service.bulkRestore).toHaveBeenCalledWith([1, 2]);
  });

  it('transforms string ids before clients controller forwards bulk restore payloads', async () => {
    const service = {
      bulkRestore: jest.fn(),
    } as unknown as jest.Mocked<ClientService>;
    const controller = new ClientController(service);

    const dto = await validationPipe.transform({ ids: ['1', '2'] }, bodyMetadata);

    await controller.bulkRestore(dto);

    expect(service.bulkRestore).toHaveBeenCalledWith([1, 2]);
  });

  it('transforms string ids before suppliers controller forwards bulk restore payloads', async () => {
    const service = {
      bulkRestore: jest.fn(),
    } as unknown as jest.Mocked<SupplierService>;
    const controller = new SupplierController(service);

    const dto = await validationPipe.transform({ ids: ['1', '2'] }, bodyMetadata);

    await controller.bulkRestore(dto);

    expect(service.bulkRestore).toHaveBeenCalledWith([1, 2]);
  });
});
