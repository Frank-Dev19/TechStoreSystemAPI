import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceType } from '../enums';
import { buildAutomaticCustomerSummary } from '../service-agreements/customer-summary';

// Reception documents describe the original accepted scope, not a later revision.
export function initialCustomerQuotation(item: ServiceOrderItem, serviceType: ServiceType) {
  if (![ServiceType.STANDARD_SERVICE, ServiceType.ASSEMBLY].includes(serviceType)) return {};
  const initial = item.commercialVersions?.find((version) => Number(version.versionNumber) === 1);
  if (!initial) return {};
  return {
    customerSummary: (initial.lines?.length ? buildAutomaticCustomerSummary(initial.lines) : initial.customerSummary?.trim()) || `Servicio técnico de ${[item.equipmentTypeOther || item.equipmentType, item.brand, item.model].filter(Boolean).join(' ')}`,
    quotationTotal: Number(initial.totalAmount),
  };
}
