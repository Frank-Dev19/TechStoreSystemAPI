import { BadRequestException, ConflictException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceOrderSurveyService } from './service-order-survey.service';

describe('ServiceOrderSurveyService', () => {
  const repository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 7, ...value })),
    manager: { transaction: jest.fn() },
  };
  const serviceOrderRepository = { findOne: jest.fn() };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'SERVICE_ORDER_SURVEY_TOKEN_SECRET') return 'test-secret-with-enough-entropy';
      if (key === 'SERVICE_ORDER_SURVEY_VALID_DAYS') return '7';
      return undefined;
    }),
  } as unknown as ConfigService;
  let service: ServiceOrderSurveyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServiceOrderSurveyService(repository as any, serviceOrderRepository as any, config);
  });

  it('reutiliza una única encuesta por orden', async () => {
    const existing = { id: 7, serviceOrderId: 20, expiresAt: new Date(Date.now() + 60_000) };
    repository.findOne.mockResolvedValue(existing);

    const first = await service.issueForOrder(20);
    const second = await service.issueForOrder(20);

    expect(first.token).toBe(second.token);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rechaza firmas inválidas', async () => {
    await expect(service.getPublicSurvey('7.invalid')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una encuesta vencida', async () => {
    const token = (service as any).buildToken(7);
    repository.findOne.mockResolvedValue({ id: 7, expiresAt: new Date(Date.now() - 1), submittedAt: null });
    await expect(service.getPublicSurvey(token)).rejects.toBeInstanceOf(GoneException);
  });

  it('impide reemplazar una respuesta existente', async () => {
    const token = (service as any).buildToken(7);
    repository.manager.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: () => ({
          findOne: jest.fn().mockResolvedValue({ id: 7, submittedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
          save: jest.fn(),
        }),
      }),
    );

    await expect(
      service.submit(token, { overallRating: 5, attentionRating: 5, serviceQualityRating: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
