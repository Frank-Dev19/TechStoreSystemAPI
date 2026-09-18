import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService', () => {
    const usersRepo = {
        findOne: jest.fn(),
        save: jest.fn(),
    };
    const documentTypesRepo = {
        findOne: jest.fn(),
    };
    const rolesService = {
        findByIds: jest.fn(),
    };

    let service: UsersService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new UsersService(
            usersRepo as any,
            documentTypesRepo as any,
            rolesService as any,
        );
    });

    it('actualiza y normaliza el correo del usuario', async () => {
        const user = {
            id: 7,
            email: 'anterior@test.com',
            documentType: { id: 1, name: 'DNI', digits: 8 },
            documentNumber: '12345678',
            roles: [],
        };
        usersRepo.findOne
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce(null);
        usersRepo.save.mockImplementation(async (value) => value);

        const result = await service.update(7, { email: '  NUEVO@TEST.COM  ' });

        expect(usersRepo.findOne).toHaveBeenNthCalledWith(2, {
            where: { email: 'nuevo@test.com' },
            select: ['id'],
        });
        expect(user.email).toBe('nuevo@test.com');
        expect(usersRepo.save).toHaveBeenCalledWith(user);
        expect(result.email).toBe('nuevo@test.com');
    });

    it('rechaza actualizar con el correo de otro usuario', async () => {
        const user = {
            id: 7,
            email: 'anterior@test.com',
            documentType: { id: 1, name: 'DNI', digits: 8 },
            documentNumber: '12345678',
            roles: [],
        };
        usersRepo.findOne
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({ id: 9 });

        await expect(service.update(7, { email: 'ocupado@test.com' }))
            .rejects.toBeInstanceOf(ConflictException);
        expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('normaliza el correo usado para buscar credenciales', async () => {
        usersRepo.findOne.mockResolvedValue(null);

        await service.findByEmail('  USER@TEST.COM ');

        expect(usersRepo.findOne).toHaveBeenCalledWith({
            where: { email: 'user@test.com' },
        });
    });
});
