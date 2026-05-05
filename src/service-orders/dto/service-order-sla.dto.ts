export type ServiceOrderSlaStage =
  | 'assignment'
  | 'diagnosis'
  | 'service'
  | 'pickup'
  | 'terminal';

export type ServiceOrderSlaDto = {
  stage: ServiceOrderSlaStage;
  targetMinutes: number | null;
  elapsedMinutes: number;
  remainingMinutes: number | null;
  breached: boolean;
};
