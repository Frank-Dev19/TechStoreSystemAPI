import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WhatsAppTemplateDispatch = {
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
  quickReplyPayloads: string[];
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
};

type SingleOrderTemplateInput = BaseTemplateInput & {
  orderCode: string;
  equipmentLabel: string;
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
        'diagnostico_y_acuerdo_disponible',
      this.configService.get<string>('WHATSAPP_TEMPLATE_DIAGNOSIS_AGREEMENT_LANGUAGE') || 'es',
      [input.clientName, input.equipmentLabel, input.orderCode, input.totalAmount],
      input.quickReplyPayloads,
    );
  }

  buildRediagnosisAgreementTemplate(input: AgreementTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_REDIAGNOSIS_AGREEMENT_NAME') ||
        'rediagnostico_y_nuevo_acuerdo',
      this.configService.get<string>('WHATSAPP_TEMPLATE_REDIAGNOSIS_AGREEMENT_LANGUAGE') || 'es',
      [input.clientName, input.equipmentLabel, input.orderCode, input.totalAmount],
      input.quickReplyPayloads,
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

  buildCancellationWithFeeTemplate(input: SingleOrderTemplateInput): WhatsAppTemplateDispatch {
    return this.buildTemplate(
      this.configService.get<string>('WHATSAPP_TEMPLATE_CANCEL_WITH_FEE_NAME') ||
        'orden_cancelada_con_cobro_diagnostico',
      this.configService.get<string>('WHATSAPP_TEMPLATE_CANCEL_WITH_FEE_LANGUAGE') || 'es',
      [input.clientName, input.orderCode, input.equipmentLabel],
      input.quickReplyPayloads,
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

  buildSurveyRequestTemplate(input: SingleOrderTemplateInput): WhatsAppTemplateDispatch | null {
    const templateName = this.configService.get<string>('WHATSAPP_TEMPLATE_SURVEY_NAME')?.trim();
    if (!templateName) {
      return null;
    }

    return this.buildTemplate(
      templateName,
      this.configService.get<string>('WHATSAPP_TEMPLATE_SURVEY_LANGUAGE') || 'es',
      [input.clientName, input.orderCode, input.equipmentLabel],
      input.quickReplyPayloads,
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
