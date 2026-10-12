import { initialCustomerQuotation } from './initial-customer-quotation';
import { ServiceType } from '../enums';
import { ServiceOrderItem } from '../entities/service-order-item.entity';

describe('Express customer quotation snapshot', () => {
  const item = { equipmentType: 'LAPTOP', brand: 'Lenovo', model: 'ThinkPad', commercialVersions: [
    { versionNumber: 2, customerSummary: 'Alcance nuevo', totalAmount: 300 },
    { versionNumber: 1, customerSummary: 'Instalación inicial', totalAmount: 150 },
  ] } as ServiceOrderItem;
  it('keeps the original Express scope in reception documents after a revision', () => {
    expect(initialCustomerQuotation(item, ServiceType.STANDARD_SERVICE)).toEqual({ customerSummary: 'Instalación inicial', quotationTotal: 150 });
  });
  it('does not invent a quotation for diagnosis intake', () => {
    expect(initialCustomerQuotation(item, ServiceType.DIAGNOSIS)).toEqual({});
  });
  it('supports historical versions without a summary without exposing products', () => {
    expect(initialCustomerQuotation({ ...item, commercialVersions: [{ versionNumber: 1, totalAmount: 90 }] } as ServiceOrderItem, ServiceType.STANDARD_SERVICE))
      .toEqual({ customerSummary: 'Servicio técnico de LAPTOP Lenovo ThinkPad', quotationTotal: 90 });
  });
});
