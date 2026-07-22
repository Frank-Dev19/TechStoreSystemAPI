import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type BillingEnvironment = 'beta' | 'produccion' | 'nubefact_beta' | 'nubefact_produccion';
export type BillingPlan = 'free' | 'premium';

@Entity({ name: 'business_profile' })
export class BusinessProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'ruc', type: 'varchar', length: 11, nullable: true })
  ruc?: string | null;

  @Column({ name: 'razon_social', type: 'varchar', length: 200, nullable: true })
  razonSocial?: string | null;

  @Column({ name: 'nombre_comercial', type: 'varchar', length: 200, nullable: true })
  nombreComercial?: string | null;

  @Column({ name: 'direccion', type: 'varchar', length: 255, nullable: true })
  direccion?: string | null;

  @Column({ name: 'ubigueo', type: 'varchar', length: 6, nullable: true })
  ubigueo?: string | null;

  @Column({ name: 'codigo_pais', length: 2, default: 'PE' })
  codigoPais: string;

  @Column({ name: 'departamento', type: 'varchar', length: 100, nullable: true })
  departamento?: string | null;

  @Column({ name: 'provincia', type: 'varchar', length: 100, nullable: true })
  provincia?: string | null;

  @Column({ name: 'distrito', type: 'varchar', length: 100, nullable: true })
  distrito?: string | null;

  @Column({ name: 'urbanizacion', type: 'varchar', length: 150, nullable: true })
  urbanizacion?: string | null;

  @Column({ name: 'cod_local', type: 'varchar', length: 10, nullable: true })
  codLocal?: string | null;

  @Column({ name: 'email', type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  @Column({ name: 'telephone', type: 'varchar', length: 30, nullable: true })
  telephone?: string | null;

  @Column({ name: 'billing_plan', length: 20, default: 'free' })
  plan: BillingPlan;

  @Column({ name: 'billing_environment', length: 30, default: 'beta' })
  environment: BillingEnvironment;

  @Column({ name: 'apis_peru_company_id', type: 'int', nullable: true })
  apisPeruCompanyId?: number | null;

  @Column({ name: 'sol_user', type: 'varchar', length: 100, nullable: true })
  solUser?: string | null;

  @Column({ name: 'sol_pass', type: 'text', nullable: true })
  solPass?: string | null;

  @Column({ name: 'client_id', type: 'text', nullable: true })
  clientId?: string | null;

  @Column({ name: 'client_secret', type: 'text', nullable: true })
  clientSecret?: string | null;

  @Column({ name: 'certificado_base64', type: 'mediumtext', nullable: true })
  certificadoBase64?: string | null;

  @Column({ name: 'certificado_filename', type: 'varchar', length: 180, nullable: true })
  certificadoFilename?: string | null;

  @Column({ name: 'certificado_updated_at', type: 'datetime', nullable: true })
  certificadoUpdatedAt?: Date | null;

  @Column({ name: 'logo_base64', type: 'mediumtext', nullable: true })
  logoBase64?: string | null;

  @Column({ name: 'logo_filename', type: 'varchar', length: 180, nullable: true })
  logoFilename?: string | null;

  @Column({ name: 'logo_updated_at', type: 'datetime', nullable: true })
  logoUpdatedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
