export enum ServiceOrderInboxDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum ServiceOrderInboxAuthorRole {
  CLIENT = 'CLIENT',
  TECHNICIAN = 'TECHNICIAN',
  RECEPTION = 'RECEPTION',
  SUPERVISOR = 'SUPERVISOR',
  SYSTEM = 'SYSTEM',
}

export enum ServiceOrderInboxAttachmentType {
  IMAGE = 'image',
  PDF = 'pdf',
  AUDIO = 'audio',
  DOCUMENT = 'document',
}

export enum ServiceOrderInboxDeliveryStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  RECEIVED = 'RECEIVED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export type ServiceOrderInboxViewerRole = 'ADMIN' | 'SUPERVISOR' | 'RECEPTION' | 'TECHNICIAN';
