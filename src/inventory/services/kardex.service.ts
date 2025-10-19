import { Injectable } from '@nestjs/common';
import { MovementsService } from './movements.service';
@Injectable()
export class KardexService {
    constructor(private readonly movSvc: MovementsService) { }
    list(filters: any) { return this.movSvc.listKardex(filters); }
}
