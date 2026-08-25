import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WhatsAppTemplateDispatch = {
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
  quickReplyPayloads: string[];
  urlButtonParameters?: string[];
  documentUrl?: string | null;
  documentFileName?: string | null;
};

type BaseTemplateInput = {
  clientName: string;
  quickReplyPayloads?: string[];
};

type OrderIntakeTemplateInput = BaseTemplateInput & {
  orderDescriptor: string;
  documentUrl: string;
  documentFileName: string;
};

type AgreementTemplateInput = BaseTemplateInput & {
  equipmentLabel: string;
  orderCode: string;
  totalAmount: string;
  documentUrl?: string;
  documentFileName?: string;
};

type SingleOrderTemplateInput = BaseTemplateInput & {
  orderCode: string;
  equipmentLabel: string;
};

type SurveyTemplateInput = SingleOrderTemplateInput & {
  surveyToken: string;
};

type QuoteReminderTemplateInput = AgreementTemplateInput;

type PaymentReceiptTemplateInput = BaseTemplateInput & {
  orderCode: string;
  documentNumber: string;
  totalAmount: string;
  documentUrl: string;
  documentFileName: string;
};

type PickupReminderTemplateInput = BaseTemplateInput & {
  orderCode: string;
  equipmentSummary: string;
  documentUrl: string;
  documentFileName: string;
};

type CancellationSummaryTemplateInput = BaseTemplateInput & {
  orderCode: string;
  itemCount: string;
  documentUrl: string;
  documentFileName: string;
};

type FinalServiceTemplateInput = BaseTemplateInput & {
  equipmentLabel: string;
  itemCode: string;
  documentUrl: string;
  documentFileName: string;
};

type WarrantyStatusTemplateInput = BaseTemplateInput & {
  orderCode: string;
  statusLabel: string;
};

@Injectable()
export class ServiceOrderWhatsAppTemplateService {
  constructor(private readonly configService: ConfigService) {}

  buildOrderIntakeTemplate(input: OrderIntakeTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_ORDER_INTAKE_NAME') || 'ordenes_ingresadas_asignadas',
      this.configService.get<string>('WHATSAPP_TEMPLATE_ORDER_INTAKE_LANGUAGE') || 'es',
      [input.clientName, input.orderDescriptor],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  buildStandardOrderConfirmedTemplate(input: OrderIntakeTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_STANDARD_ORDER_NAME') || 'orden_standard_confirmada',
      this.configService.get<string>('WHATSAPP_TEMPLATE_STANDARD_ORDER_LANGUAGE') || 'es',
      [input.clientName, input.orderDescriptor],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  buildDiagnosisAgreementAvailableTemplate(input: AgreementTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_DIAGNOSIS_AGREEMENT_NAME') ||
        'diagnostico_cotizacion_equipo',
      this.configService.get<string>('WHATSAPP_TEMPLATE_DIAGNOSIS_AGREEMENT_LANGUAGE') || 'es_PE',
      [input.clientName, input.equipmentLabel, input.orderCode, input.totalAmount],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  buildRediagnosisAgreementTemplate(input: AgreementTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_REDIAGNOSIS_AGREEMENT_NAME') ||
        'rediagnostico_recotizacion_equipo',
      this.configService.get<string>('WHATSAPP_TEMPLATE_REDIAGNOSIS_AGREEMENT_LANGUAGE') || 'es_PE',
      [input.clientName, input.equipmentLabel, input.orderCode, input.totalAmount],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  buildAuthorizationConfirmedTemplate(input: SingleOrderTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_AUTHORIZATION_CONFIRMED_NAME') ||
        'autorizacion_confirmada_inicio_servicio',
      this.configService.get<string>('WHATSAPP_TEMPLATE_AUTHORIZATION_CONFIRMED_LANGUAGE') || 'es',
      [input.clientName, input.equipmentLabel, input.orderCode],
      input.quickReplyPayloads,
    );
  }

  buildReadyForPickupTemplate(input: SingleOrderTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_READY_FOR_PICKUP_NAME') || 'equipo_listo_retiro',
      this.configService.get<string>('WHATSAPP_TEMPLATE_READY_FOR_PICKUP_LANGUAGE') || 'es',
      [input.clientName, input.orderCode, input.equipmentLabel],
      input.quickReplyPayloads,
    );
  }

  buildNoSolutionTemplate(input: SingleOrderTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_NO_SOLUTION_NAME') || 'orden_sin_solucion',
      this.configService.get<string>('WHATSAPP_TEMPLATE_NO_SOLUTION_LANGUAGE') || 'es',
      [input.clientName, input.orderCode, input.equipmentLabel],
      input.quickReplyPayloads,
    );
  }

  buildCancellationSummaryTemplate(input: CancellationSummaryTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_CANCELLATION_SUMMARY_NAME') ||
        'resumen_cancelacion_equipos',
      this.configService.get<string>('WHATSAPP_TEMPLATE_CANCELLATION_SUMMARY_LANGUAGE') || 'es_PE',
      [input.clientName, input.itemCount, input.orderCode],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  buildFinalServiceTemplate(input: FinalServiceTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_FINAL_SERVICE_NAME') ||
        'estado_final_servicio',
      this.configService.get<string>('WHATSAPP_TEMPLATE_FINAL_SERVICE_LANGUAGE') || 'es_PE',
      [input.clientName, input.equipmentLabel, input.itemCode],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  buildWarrantyStatusTemplate(input: WarrantyStatusTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_WARRANTY_STATUS_NAME') || 'garantia_estado',
      this.configService.get<string>('WHATSAPP_TEMPLATE_WARRANTY_STATUS_LANGUAGE') || 'es',
      [input.clientName, input.orderCode, input.statusLabel],
      input.quickReplyPayloads,
    );
  }

  buildPauseOrBlockedTemplate(input: SingleOrderTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_PAUSE_BLOCKED_NAME') || 'pausa_o_bloqueo',
      this.configService.get<string>('WHATSAPP_TEMPLATE_PAUSE_BLOCKED_LANGUAGE') || 'es',
      [input.clientName, input.orderCode, input.equipmentLabel],
      input.quickReplyPayloads,
    );
  }

  hasSurveyRequestTemplate(): boolean {
    return Boolean(this.configService.get<string>('WHATSAPP_TEMPLATE_SURVEY_NAME')?.trim());
  }

  buildSurveyRequestTemplate(input: SurveyTemplateInput): WhatsAppTemplateDispatch | null {
    const templateName = this.configService.get<string>('WHATSAPP_TEMPLATE_SURVEY_NAME')?.trim();
    if (!templateName) {
      return null;
    }

    return {
      ...this.buildTemplate(
      templateName,
      this.configService.get<string>('WHATSAPP_TEMPLATE_SURVEY_LANGUAGE') || 'es_PE',
      [input.clientName, input.orderCode, input.equipmentLabel],
      input.quickReplyPayloads,
      ),
      urlButtonParameters: [input.surveyToken],
    };
  }

  buildQuoteReminderTemplate(input: QuoteReminderTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_QUOTE_REMINDER_NAME') ||
        'recordatorio_cotizacion_pendiente',
      this.configService.get<string>('WHATSAPP_TEMPLATE_QUOTE_REMINDER_LANGUAGE') || 'es_PE',
      [input.clientName, input.equipmentLabel, input.orderCode, input.totalAmount],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  buildPaymentReceiptTemplate(input: PaymentReceiptTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_PAYMENT_RECEIPT_NAME') ||
        'comprobante_pago_orden_servicio',
      this.configService.get<string>('WHATSAPP_TEMPLATE_PAYMENT_RECEIPT_LANGUAGE') || 'es_PE',
      [input.clientName, input.orderCode, input.documentNumber, input.totalAmount],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  buildPickupReminderTemplate(input: PickupReminderTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_PICKUP_REMINDER_NAME') ||
        'recordatorio_recojo_equipo',
      this.configService.get<string>('WHATSAPP_TEMPLATE_PICKUP_REMINDER_LANGUAGE') || 'es_PE',
      [input.clientName, input.orderCode, input.equipmentSummary],
      input.quickReplyPayloads,
      input.documentUrl,
      input.documentFileName,
    );
  }

  private buildTemplate(
    templateName: string,
    languageCode: string,
    bodyParameters: string[],
    quickReplyPayloads?: string[],
    documentUrl?: string | null,
    documentFileName?: string | null,
  ): WhatsAppTemplateDispatch {
    return {
      templateName,
      languageCode,
      bodyParameters,
      quickReplyPayloads: quickReplyPayloads ?? [],
      documentUrl: documentUrl ?? null,
      documentFileName: documentFileName ?? null,
    };
  }
}
