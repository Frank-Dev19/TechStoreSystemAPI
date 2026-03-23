import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationDeliveryAttempt } from '../entities/notification-delivery-attempt.entity';
import { NotificationMessage } from '../entities/notification-message.entity';

@Injectable()
export class ServiceOrderNotificationService {
  constructor(
    @InjectRepository(NotificationMessage)
    private readonly notificationRepository: Repository<NotificationMessage>,
    @InjectRepository(NotificationDeliveryAttempt)
    private readonly attemptRepository: Repository<NotificationDeliveryAttempt>,
  ) {}

  async queueNotification(
    serviceOrderId: number,
    messageType: string,
    recipient: string | null,
    body: string | null,
    idempotencyKey: string,
  ): Promise<void> {
    const existing = await this.notificationRepository.findOne({ where: { idempotencyKey } });
    if (existing) {
      return;
    }

    const message = await this.notificationRepository.save(
      this.notificationRepository.create({
        serviceOrderId,
        channel: 'WHATSAPP',
        messageType,
        recipient,
        body,
        idempotencyKey,
        status: 'QUEUED',
      }),
    );

    await this.attemptRepository.save(
      this.attemptRepository.create({
        notificationMessageId: message.id,
        status: 'QUEUED',
        responsePayload: null,
      }),
    );
  }
}
