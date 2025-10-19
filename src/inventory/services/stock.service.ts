import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Stock } from '../entities/stock.entity';
import { Product } from '../entities/product.entity';
import { Lot } from '../entities/lot.entity';

@Injectable()
export class StockService {
    constructor(
        @InjectRepository(Stock) private stockRepo: Repository<Stock>,
        @InjectRepository(Product) private prodRepo: Repository<Product>,
        @InjectRepository(Lot) private lotRepo: Repository<Lot>,
    ) { }

    listAll() {
        return this.stockRepo.find({ relations: ['product', 'lot'] });
    }
}
