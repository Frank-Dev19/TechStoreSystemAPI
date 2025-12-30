// src/pricing/controllers/pricing-simulation.controller.ts
import {
    Body,
    Controller,
    Post,
    UseGuards,
    Header,
    Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PricingSimulationService } from '../services/pricing-simulation.service';
import { SimulationQueryDto, BatchSimulationQueryDto } from '../dto/simulation-query.dto2';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

@UseGuards(JwtAccessGuard)
@Controller('pricing/simulate')
export class PricingSimulationController {
    constructor(private readonly simulationService: PricingSimulationService) { }

    @Post()
    async simulate(@Body() dto: SimulationQueryDto) {
        console.log("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
        return this.simulationService.simulate(dto);
    }

    @Post('batch')
    async batchSimulate(@Body() dto: BatchSimulationQueryDto) {
        return this.simulationService.batchSimulate(dto);
    }

    @Post('audit-report')
    @Header('Content-Type', 'text/csv')
    @Header('Content-Disposition', 'attachment; filename="audit-report.csv"')
    async downloadAuditReport(
        @Body() dto: BatchSimulationQueryDto,
        @Res() res: Response,
    ) {
        const results = await this.simulationService.batchSimulate(dto);
        const csv = await this.simulationService.generateAuditReportCSV(results);
        res.send(csv);
    }
}