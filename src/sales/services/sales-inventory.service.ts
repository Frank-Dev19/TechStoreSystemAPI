// src/sales/services/sales-inventory.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, In } from 'typeorm';
import { MovementsService } from 'src/inventory/services/movements.service';
import { StockService } from 'src/inventory/services/stock.service';
import { Serial } from 'src/inventory/entities/serial.entity';
import { Lot } from 'src/inventory/entities/lot.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { MovementTypeEnum } from 'src/inventory/dto/movement.dto';
import { Movement } from 'src/inventory/entities/movement.entity';
import { MovementSerial } from 'src/inventory/entities/movement-serial.entity';

export interface StockValidationResult {
    productId: number;
    productName: string;
    requestedQty: number;
    availableQty: number;
    isValid: boolean;
    warning?: string;
    lots?: Array<{
        lotId: number;
        lotCode: string;
        expirationDate?: string;
        available: number;
    }>;
    serials?: Array<{
        serialId: number;
        serialCode: string;
        lotId?: number;
    }>;
}

@Injectable()
export class SalesInventoryService {
    constructor(
        private readonly movementsService: MovementsService,
        private readonly stockService: StockService,

        @InjectRepository(Product)
        private readonly productRepo: Repository<Product>,
        @InjectRepository(Lot)
        private readonly lotRepo: Repository<Lot>,
        @InjectRepository(Serial)
        private readonly serialRepo: Repository<Serial>,
    ) { }

    async validateStock(params: {
        productId: number;
        quantity: number;
        lotId?: number | null;
        serialIds?: number[];
    }): Promise<StockValidationResult> {
        const product = await this.productRepo.findOne({
            where: { id: params.productId },
        });

        if (!product) {
            throw new BadRequestException(`Producto con ID ${params.productId} no encontrado`);
        }

        // Para productos serializados
        if (product.isSerialized) {
            return this.validateSerializedProduct(product, params);
        }

        // Para productos con lotes
        if (product.managesExpiration) {
            return this.validateProductWithLots(product, params);
        }

        // Para productos simples
        return this.validateSimpleProduct(product, params);
    }

    private async validateSimpleProduct(
        product: Product,
        params: { quantity: number },
    ): Promise<StockValidationResult> {
        const stockLines = await this.stockService.listAll();
        const productStock = stockLines.find(s =>
            s.productId === product.id && s.lotId === null
        );

        const availableQty = productStock ? Number(productStock.qtyOnHand) : 0;
        const isValid = availableQty >= params.quantity;

        return {
            productId: product.id,
            productName: product.name,
            requestedQty: params.quantity,
            availableQty,
            isValid,
            warning: !isValid ? `Stock insuficiente. Disponible: ${availableQty}` : undefined,
        };
    }

    private async validateProductWithLots(
        product: Product,
        params: { quantity: number; lotId?: number | null },
    ): Promise<StockValidationResult> {
        // Si se especificó un lote, validar ese lote específico
        if (params.lotId) {
            const lot = await this.lotRepo.findOne({
                where: { id: params.lotId, productId: product.id },
            });

            if (!lot) {
                throw new BadRequestException(`Lote inválido para el producto ${product.name}`);
            }

            const stockLines = await this.stockService.listAll();
            const lotStock = stockLines.find(s =>
                s.productId === product.id && s.lotId === params.lotId
            );

            const availableQty = lotStock ? Number(lotStock.qtyOnHand) : 0;
            const isValid = availableQty >= params.quantity;

            return {
                productId: product.id,
                productName: product.name,
                requestedQty: params.quantity,
                availableQty,
                isValid,
                warning: !isValid ? `Stock insuficiente en lote ${lot.lotCode}. Disponible: ${availableQty}` : undefined,
                lots: [{
                    lotId: lot.id,
                    lotCode: lot.lotCode,
                    expirationDate: lot.expirationDate || undefined,
                    available: availableQty,
                }],
            };
        }

        // Si no se especificó lote, mostrar todos los lotes disponibles
        const stockLines = await this.stockService.listAll();
        const productStocks = stockLines.filter(s => s.productId === product.id && s.lotId !== null);

        const totalAvailable = productStocks.reduce((sum, s) => sum + Number(s.qtyOnHand), 0);
        const isValid = totalAvailable >= params.quantity;

        // Obtener información de lotes
        const lots = await Promise.all(
            productStocks.map(async (stock) => {
                const lot = await this.lotRepo.findOne({ where: { id: stock.lotId! } });
                return {
                    lotId: stock.lotId!,
                    lotCode: lot?.lotCode || `LOTE-${stock.lotId}`,
                    expirationDate: lot?.expirationDate || undefined,
                    available: Number(stock.qtyOnHand),
                };
            })
        );

        // Ordenar por fecha de vencimiento (más cercano primero)
        lots.sort((a, b) => {
            if (!a.expirationDate) return 1;
            if (!b.expirationDate) return -1;
            return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
        });

        return {
            productId: product.id,
            productName: product.name,
            requestedQty: params.quantity,
            availableQty: totalAvailable,
            isValid,
            warning: !isValid ? `Stock total insuficiente. Disponible: ${totalAvailable}` : undefined,
            lots,
        };
    }

    private async validateSerializedProduct(
        product: Product,
        params: { quantity: number; serialIds?: number[] },
    ): Promise<StockValidationResult> {
        // Si se enviaron seriales específicos, validar esos seriales
        if (params.serialIds && params.serialIds.length > 0) {
            if (params.serialIds.length !== params.quantity) {
                throw new BadRequestException(
                    `Para producto serializado, debe enviar exactamente ${params.quantity} serial(es)`
                );
            }

            const serials = await this.serialRepo.find({
                where: {
                    id: In(params.serialIds),
                    productId: product.id,
                    status: 'IN_STOCK',
                },
            });

            if (serials.length !== params.serialIds.length) {
                const invalidSerials = params.serialIds.filter(id =>
                    !serials.some(s => s.id === id)
                );
                throw new BadRequestException(
                    `Seriales inválidos o no disponibles: ${invalidSerials.join(', ')}`
                );
            }

            return {
                productId: product.id,
                productName: product.name,
                requestedQty: params.quantity,
                availableQty: params.quantity,
                isValid: true,
                serials: serials.map(s => ({
                    serialId: s.id,
                    serialCode: s.serialCode,
                    lotId: s.lotId || undefined,
                })),
            };
        }

        // Si no se enviaron seriales, listar disponibles
        const availableSerials = await this.serialRepo.find({
            where: {
                productId: product.id,
                status: 'IN_STOCK',
            },
            take: params.quantity + 10, // Traer algunos extras
        });

        const isValid = availableSerials.length >= params.quantity;

        return {
            productId: product.id,
            productName: product.name,
            requestedQty: params.quantity,
            availableQty: availableSerials.length,
            isValid,
            warning: !isValid
                ? `Seriales insuficientes. Disponibles: ${availableSerials.length}`
                : undefined,
            serials: availableSerials.slice(0, params.quantity).map(s => ({
                serialId: s.id,
                serialCode: s.serialCode,
                lotId: s.lotId || undefined,
            })),
        };
    }

    async registerSaleMovement(saleId: number, items: Array<{
        productId: number;
        quantity: number;
        lotId?: number | null;
        serialIds?: number[];
    }>, user: string, manager?: EntityManager) {
        const movements = [];

        for (const item of items) {
            const movement = {
                type: MovementTypeEnum.OUT,
                product_id: item.productId,
                qty: item.quantity,
                lot_id: item.lotId || undefined,
                serial_ids: item.serialIds,
                reason_code: 'SALE',
                notes: `Venta #${saleId}`,
                source_doc_type: 'SALE',
                source_doc_id: String(saleId),
                user_created: user,
            };

            await this.movementsService.createMovement(movement, user, manager);
        }
    }

    async registerSaleCancellationMovement(
        saleId: number,
        user: string,
        manager: EntityManager,
    ): Promise<void> {
        const movementRepository = manager.getRepository(Movement);
        const existingReversal = await movementRepository.findOne({
            where: {
                sourceDocType: 'SALE_CANCELLATION',
                sourceDocId: String(saleId),
            },
        });
        if (existingReversal) {
            return;
        }

        const originalMovements = await movementRepository.find({
            where: {
                type: 'OUT',
                sourceDocType: 'SALE',
                sourceDocId: String(saleId),
            },
            order: { id: 'ASC' },
        });

        for (const movement of originalMovements) {
            const serialLinks = await manager.getRepository(MovementSerial).find({
                where: { movementId: movement.id },
                relations: ['serial'],
            });
            await this.movementsService.createMovement(
                {
                    type: MovementTypeEnum.IN,
                    product_id: movement.productId,
                    qty: Number(movement.qty),
                    lot_id: movement.lotId ?? undefined,
                    serial_codes: serialLinks.map((link) => link.serial.serialCode),
                    unit_cost: Number(movement.unitCost),
                    reason_code: 'SALE_CANCELLATION',
                    notes: `Anulación de venta #${saleId}`,
                    source_doc_type: 'SALE_CANCELLATION',
                    source_doc_id: String(saleId),
                },
                user,
                manager,
            );
        }
    }
}
