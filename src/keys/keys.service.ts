import { Injectable, NotFoundException, ForbiddenException, } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { OperationKey } from './entities/operation-key.entity';
import { User } from 'src/users/entities/user.entity';



@Injectable()
export class KeysService {

    constructor(
        @InjectRepository(OperationKey)
        private readonly keysRepo: Repository<OperationKey>,
    ) { }

    // Crear/rotar clave para una acción
    async createOrRotate(action: string, rawCode: string, owner: User) {
        const salt = await bcrypt.genSalt();
        const codeHash = await bcrypt.hash(rawCode, salt);

        // Desactivar claves anteriores de esa acción
        await this.keysRepo.update({ action, isActive: true }, { isActive: false });

        // Guardar nueva
        const opKey = this.keysRepo.create({
            action,
            codeHash,
            isActive: true,
            owner,
        });
        return this.keysRepo.save(opKey);
    }

    // Validar clave ingresada por un usuario
    async validate(action: string, rawCode: string) {
        const key = await this.keysRepo.findOne({
            where: { action, isActive: true },
        });
        if (!key) throw new NotFoundException('Clave no configurada para esta acción');

        const ok = await bcrypt.compare(rawCode, key.codeHash);
        if (!ok) throw new ForbiddenException('Clave incorrecta');
        return true;
    }

    // Listar claves activas
    async listActive() {
        return this.keysRepo.find({ where: { isActive: true } });
    }

}
