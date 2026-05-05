export type DerivedMetricDto = {
  valueMinutes: number | null;
  isComputable: boolean;
  missingTimestamps: string[];
};

export type ServiceOrderTimeMetricsDto = {
  timeToDiagnosis: DerivedMetricDto;
  timeToServiceStart: DerivedMetricDto;
  timeToService: DerivedMetricDto;
  timeToResolution: DerivedMetricDto;
  timeToDelivery: DerivedMetricDto;
};
