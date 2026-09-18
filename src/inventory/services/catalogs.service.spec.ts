import { Repository } from 'typeorm';
import { Unit } from '../entities/unit.entity';
import { CatalogsService } from './catalogs.service';

describe('CatalogsService defaults', () => {
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let service: CatalogsService;

  beforeEach(() => {
    unitRepo = {
      find: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Unit>>;
    service = new CatalogsService({} as any, unitRepo, {} as any);
  });

  it('crea Unidad con codigo NIU cuando el catalogo esta vacio', async () => {
    unitRepo.find.mockResolvedValue([]);
    unitRepo.save.mockImplementation(async (unit) => unit as Unit);

    await expect(service.ensureDefaultUnit()).resolves.toBe('created');
    expect(unitRepo.save).toHaveBeenCalledWith({ name: 'Unidad', abbreviation: 'NIU' });
  });

  it('corrige la abreviacion de una unidad existente sin duplicarla', async () => {
    const unit = { id: 4, name: 'Unidad', abbreviation: 'UND' } as Unit;
    unitRepo.find.mockResolvedValue([unit]);
    unitRepo.save.mockImplementation(async (value) => value as Unit);

    await expect(service.ensureDefaultUnit()).resolves.toBe('updated');
    expect(unit.abbreviation).toBe('NIU');
    expect(unitRepo.create).not.toHaveBeenCalled();
  });

  it('conserva una unidad NIU ya configurada', async () => {
    unitRepo.find.mockResolvedValue([
      { id: 4, name: 'Unidad', abbreviation: 'niu' } as Unit,
    ]);

    await expect(service.ensureDefaultUnit()).resolves.toBe('unchanged');
    expect(unitRepo.save).not.toHaveBeenCalled();
  });
});
