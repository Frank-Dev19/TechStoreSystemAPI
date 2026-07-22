import { Client } from '../entities/client.entity';

export type ApisPeruClientPayload = {
  tipoDoc?: string | null;
  numDoc: string;
  rznSocial: string;
  address?: {
    ubigueo?: string | null;
    codigoPais?: string | null;
    departamento?: string | null;
    provincia?: string | null;
    distrito?: string | null;
    urbanizacion?: string | null;
    direccion?: string | null;
  };
  email?: string | null;
  telephone?: string | null;
};

export function mapClientToApisPeruPayload(client: Client): ApisPeruClientPayload {
  return {
    tipoDoc: client.documentType?.sunatCode ?? null,
    numDoc: client.documentNumber,
    rznSocial: client.name,
    address: {
      ubigueo: client.ubigeo ?? null,
      codigoPais: client.countryCode ?? 'PE',
      departamento: client.department ?? null,
      provincia: client.province ?? client.city ?? null,
      distrito: client.district ?? null,
      urbanizacion: client.urbanization ?? null,
      direccion: client.address ?? null,
    },
    email: client.email ?? null,
    telephone: client.phone ?? null,
  };
}
