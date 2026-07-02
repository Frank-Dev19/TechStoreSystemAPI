export type ApisPeruAddressPayload = {
  ubigueo?: string | null;
  codigoPais?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  urbanizacion?: string | null;
  direccion?: string | null;
  codLocal?: string | null;
};

export type ApisPeruCompanyPayload = {
  ruc?: string | null;
  razonSocial?: string | null;
  nombreComercial?: string | null;
  address?: ApisPeruAddressPayload;
  email?: string | null;
  telephone?: string | null;
};

export type ApisPeruInvoiceDetailPayload = {
  unidad: string;
  cantidad: number;
  codProducto?: string | null;
  descripcion: string;
  mtoValorUnitario: number;
  descuento: number;
  igv: number;
  tipAfeIgv: string;
  totalImpuestos: number;
  mtoPrecioUnitario: number;
  mtoValorVenta: number;
  mtoBaseIgv: number;
  porcentajeIgv: number;
};

export type ApisPeruInvoicePayload = {
  ublVersion: string;
  tipoOperacion: string;
  tipoDoc: string;
  serie: string;
  correlativo: string;
  fechaEmision: string;
  fecVencimiento?: string | null;
  formaPago: {
    moneda: string;
    tipo: 'Contado' | 'Credito';
    monto?: number;
  };
  tipoMoneda: string;
  client: {
    tipoDoc?: string | null;
    numDoc: string;
    rznSocial: string;
    address?: ApisPeruAddressPayload;
    email?: string | null;
    telephone?: string | null;
  };
  company: ApisPeruCompanyPayload;
  mtoOperGravadas: number;
  mtoIGV: number;
  valorVenta: number;
  totalImpuestos: number;
  subTotal: number;
  mtoImpVenta: number;
  details: ApisPeruInvoiceDetailPayload[];
  legends: Array<{
    code: string;
    value: string;
  }>;
  observacion?: string | null;
};

export type ApisPeruDocumentResponse = {
  xml?: string;
  hash?: string;
  sunatResponse?: {
    success?: boolean;
    cdrZip?: string;
    cdrResponse?: {
      id?: string;
      code?: string;
      description?: string;
      notes?: string[];
    };
  };
  [key: string]: unknown;
};
