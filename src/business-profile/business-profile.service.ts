import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';
import { BusinessProfile } from './entities/business-profile.entity';

const SECRET_MASK = '********';

@Injectable()
export class BusinessProfileService {
  constructor(
    @InjectRepository(BusinessProfile)
    private readonly repo: Repository<BusinessProfile>,
  ) {}

  async findCurrent() {
    const profile = await this.getOrCreate();
    return this.toResponse(profile);
  }

  async upsert(dto: UpdateBusinessProfileDto) {
    const profile = await this.getOrCreate();
    const now = new Date();

    Object.assign(profile, {
      ruc: this.clean(dto.ruc, profile.ruc),
      razonSocial: this.clean(dto.razonSocial, profile.razonSocial),
      nombreComercial: this.clean(dto.nombreComercial, profile.nombreComercial),
      direccion: this.clean(dto.direccion, profile.direccion),
      ubigueo: this.clean(dto.ubigueo, profile.ubigueo),
      codigoPais: this.clean(dto.codigoPais, profile.codigoPais) ?? 'PE',
      departamento: this.clean(dto.departamento, profile.departamento),
      provincia: this.clean(dto.provincia, profile.provincia),
      distrito: this.clean(dto.distrito, profile.distrito),
      urbanizacion: this.clean(dto.urbanizacion, profile.urbanizacion),
      codLocal: this.clean(dto.codLocal, profile.codLocal),
      email: this.clean(dto.email, profile.email),
      telephone: this.clean(dto.telephone, profile.telephone),
      plan: dto.plan ?? profile.plan ?? 'free',
      environment: dto.environment ?? profile.environment ?? 'beta',
      apisPeruCompanyId: dto.apisPeruCompanyId ?? profile.apisPeruCompanyId,
      solUser: this.clean(dto.solUser, profile.solUser),
    });

    if (this.hasSecretValue(dto.solPass)) profile.solPass = dto.solPass!.trim();
    if (this.hasSecretValue(dto.clientId)) profile.clientId = dto.clientId!.trim();
    if (this.hasSecretValue(dto.clientSecret)) profile.clientSecret = dto.clientSecret!.trim();

    if (dto.certificadoBase64 !== undefined) {
      profile.certificadoBase64 = this.cleanBase64(dto.certificadoBase64);
      profile.certificadoFilename = this.clean(dto.certificadoFilename, profile.certificadoFilename);
      profile.certificadoUpdatedAt = profile.certificadoBase64 ? now : null;
    }

    if (dto.logoBase64 !== undefined) {
      profile.logoBase64 = this.cleanBase64(dto.logoBase64);
      profile.logoFilename = this.clean(dto.logoFilename, profile.logoFilename);
      profile.logoUpdatedAt = profile.logoBase64 ? now : null;
    }

    const saved = await this.repo.save(profile);
    return this.toResponse(saved);
  }

  async getApisPeruCompanyPayload() {
    const profile = await this.getOrCreate();
    return {
      plan: profile.plan,
      environment: profile.environment,
      sol_user: profile.solUser,
      sol_pass: profile.solPass,
      ruc: profile.ruc,
      razon_social: profile.razonSocial,
      direccion: profile.direccion,
      certificado: profile.certificadoBase64,
      logo: profile.logoBase64,
      client_id: profile.clientId,
      client_secret: profile.clientSecret,
    };
  }

  async getInvoiceCompanyPayload() {
    const profile = await this.getOrCreate();
    return {
      ruc: profile.ruc,
      razonSocial: profile.razonSocial,
      nombreComercial: profile.nombreComercial || profile.razonSocial,
      address: {
        ubigueo: profile.ubigueo,
        codigoPais: profile.codigoPais || 'PE',
        departamento: profile.departamento,
        provincia: profile.provincia,
        distrito: profile.distrito,
        urbanizacion: profile.urbanizacion,
        direccion: profile.direccion,
        codLocal: profile.codLocal,
      },
      email: profile.email,
      telephone: profile.telephone,
    };
  }

  private async getOrCreate() {
    const existing = await this.repo.findOne({ where: {}, order: { id: 'ASC' } });
    if (existing) return existing;
    return this.repo.save(this.repo.create({ codigoPais: 'PE', plan: 'free', environment: 'beta' }));
  }

  private toResponse(profile: BusinessProfile) {
    return {
      ...profile,
      solPass: profile.solPass ? SECRET_MASK : null,
      clientId: profile.clientId ? SECRET_MASK : null,
      clientSecret: profile.clientSecret ? SECRET_MASK : null,
      certificadoBase64: undefined,
      logoBase64: profile.logoBase64 ?? null,
      hasSolPass: !!profile.solPass,
      hasClientId: !!profile.clientId,
      hasClientSecret: !!profile.clientSecret,
      hasCertificate: !!profile.certificadoBase64,
      hasLogo: !!profile.logoBase64,
    };
  }

  private clean(value: string | null | undefined, fallback?: string | null) {
    if (value === undefined) return fallback ?? null;
    const trimmed = String(value ?? '').trim();
    return trimmed ? trimmed : null;
  }

  private cleanBase64(value: string | null | undefined) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return null;
    const commaIndex = trimmed.indexOf(',');
    return commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
  }

  private hasSecretValue(value?: string | null) {
    const trimmed = String(value ?? '').trim();
    return !!trimmed && trimmed !== SECRET_MASK;
  }
}
