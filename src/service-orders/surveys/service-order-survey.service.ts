import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { ServiceOrder } from '../entities/service-order.entity';
import { SubmitServiceOrderSurveyDto } from './dto/submit-service-order-survey.dto';
import { ServiceOrderSurvey } from './service-order-survey.entity';

@Injectable()
export class ServiceOrderSurveyService {
  constructor(
    @InjectRepository(ServiceOrderSurvey)
    private readonly repository: Repository<ServiceOrderSurvey>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    private readonly configService: ConfigService,
  ) {}

  async issueForOrder(serviceOrderId: number): Promise<{ token: string; expiresAt: Date }> {
    let survey = await this.repository.findOne({ where: { serviceOrderId } });
    if (!survey) {
      const orderExists = await this.serviceOrderRepository.findOne({ where: { id: serviceOrderId } });
      if (!orderExists) throw new NotFoundException('La orden de servicio no existe');

      const validDays = Math.max(
        1,
        Number(this.configService.get<string>('SERVICE_ORDER_SURVEY_VALID_DAYS') || 7),
      );
      survey = await this.repository.save(
        this.repository.create({
          serviceOrderId,
          expiresAt: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000),
          submittedAt: null,
          overallRating: null,
          attentionRating: null,
          serviceQualityRating: null,
          comment: null,
        }),
      );
    }

    return { token: this.buildToken(survey.id), expiresAt: survey.expiresAt };
  }

  async getPublicSurvey(token: string) {
    const surveyId = this.verifyAndExtractId(token);
    const survey = await this.repository.findOne({
      where: { id: surveyId },
      relations: ['serviceOrder', 'serviceOrder.items'],
    });
    if (!survey) throw new NotFoundException('La encuesta no existe');
    if (survey.submittedAt) return { status: 'ANSWERED' as const };
    if (survey.expiresAt.getTime() <= Date.now()) throw new GoneException('La encuesta ha vencido');

    return {
      status: 'AVAILABLE' as const,
      orderCode: survey.serviceOrder.code,
      clientName: this.firstName(survey.serviceOrder.clientSnapshotName),
      equipmentSummary: this.buildEquipmentSummary(survey.serviceOrder),
      expiresAt: survey.expiresAt.toISOString(),
    };
  }

  async submit(token: string, dto: SubmitServiceOrderSurveyDto) {
    const surveyId = this.verifyAndExtractId(token);
    return this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceOrderSurvey);
      const survey = await repository.findOne({
        where: { id: surveyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!survey) throw new NotFoundException('La encuesta no existe');
      if (survey.submittedAt) throw new ConflictException('La encuesta ya fue respondida');
      if (survey.expiresAt.getTime() <= Date.now()) throw new GoneException('La encuesta ha vencido');

      survey.overallRating = dto.overallRating;
      survey.attentionRating = dto.attentionRating;
      survey.serviceQualityRating = dto.serviceQualityRating;
      survey.comment = dto.comment?.trim() || null;
      survey.submittedAt = new Date();
      await repository.save(survey);
      return { status: 'ANSWERED' as const };
    });
  }

  private buildToken(id: number): string {
    return `${id}.${this.sign(String(id))}`;
  }

  private verifyAndExtractId(token: string): number {
    const match = /^(\d+)\.([a-f0-9]{64})$/i.exec(String(token ?? '').trim());
    if (!match) throw new BadRequestException('El enlace de la encuesta no es válido');
    const id = Number(match[1]);
    const expected = Buffer.from(this.sign(match[1]), 'hex');
    const received = Buffer.from(match[2], 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new BadRequestException('El enlace de la encuesta no es válido');
    }
    return id;
  }

  private sign(value: string): string {
    const secret = this.configService.get<string>('SERVICE_ORDER_SURVEY_TOKEN_SECRET')?.trim();
    if (!secret) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new InternalServerErrorException('SERVICE_ORDER_SURVEY_TOKEN_SECRET es obligatorio');
      }
      return createHmac('sha256', 'local-survey-secret').update(value).digest('hex');
    }
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private firstName(name: string | null | undefined): string {
    return String(name ?? 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
  }

  private buildEquipmentSummary(order: ServiceOrder): string {
    const items = order.items ?? [];
    if (items.length !== 1) return `${items.length || 1} equipos`;
    const item = items[0];
    const labels: Record<string, string> = {
      LAPTOP: 'Laptop',
      DESKTOP_PC: 'PC de escritorio',
      ALL_IN_ONE: 'All in One',
      PRINTER: 'Impresora',
      SCANNER: 'Escáner',
      PROJECTOR: 'Proyector',
      MONITOR: 'Monitor',
      SERVER: 'Servidor',
      NETWORK_DEVICE: 'Equipo de red',
      OTHER: item.equipmentTypeOther || 'Equipo',
    };
    const type = labels[item.equipmentType] || 'Equipo';
    return [type, item.brand, item.model].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ');
  }
}
