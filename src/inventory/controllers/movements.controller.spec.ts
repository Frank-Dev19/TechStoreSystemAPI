import { MovementsController } from './movements.controller';
import { MovementsService } from '../services/movements.service';
import { StreamableFile } from '@nestjs/common';

describe('MovementsController', () => {
  let service: jest.Mocked<MovementsService>;
  let controller: MovementsController;

  beforeEach(() => {
    service = {
      listKardex: jest.fn(),
      exportKardexCsv: jest.fn(),
    } as unknown as jest.Mocked<MovementsService>;
    controller = new MovementsController(service);
  });

  it('forwards pagination and filters when listing the kardex', async () => {
    service.listKardex.mockResolvedValue({
      data: [],
      total: 45,
      page: 2,
      limit: 20,
    });

    await controller.list({
      product_id: '7',
      reason_code: 'VENTA',
      date_from: '2026-09-01',
      date_to: '2026-09-16',
      page: '2',
      limit: '20',
    });

    expect(service.listKardex).toHaveBeenCalledWith({
      product_id: 7,
      reason_code: 'VENTA',
      date_from: '2026-09-01',
      date_to: '2026-09-16',
      page: 2,
      limit: 20,
    });
  });

  it('exports the complete filtered range without page parameters', async () => {
    service.exportKardexCsv.mockResolvedValue('\ufeffFecha,Tipo\n');
    const result = await controller.exportCsv({
      product_id: '7',
      reason_code: 'VENTA',
      date_from: '2026-09-01',
      date_to: '2026-09-16',
      page: '3',
      limit: '20',
    });

    expect(service.exportKardexCsv).toHaveBeenCalledWith({
      product_id: 7,
      reason_code: 'VENTA',
      date_from: '2026-09-01',
      date_to: '2026-09-16',
    });
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getHeaders()).toEqual(expect.objectContaining({
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="kardex-2026-09-01-a-2026-09-16.csv"',
    }));
  });
});
