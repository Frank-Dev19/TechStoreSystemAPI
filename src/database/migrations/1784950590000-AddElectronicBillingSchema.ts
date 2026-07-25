import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddElectronicBillingSchema1784950590000 implements MigrationInterface {
  name = 'AddElectronicBillingSchema1784950590000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`electronic_documents\` (\`id\` int NOT NULL AUTO_INCREMENT, \`sale_id\` int NOT NULL, \`company_id\` int NOT NULL, \`provider\` varchar(30) NOT NULL DEFAULT 'APIS_PERU', \`provider_endpoint\` varchar(120) NULL, \`document_type\` varchar(32) NOT NULL, \`sunat_document_type_code\` varchar(4) NOT NULL, \`series\` varchar(10) NOT NULL, \`number\` varchar(15) NOT NULL, \`status\` varchar(20) NOT NULL DEFAULT 'PENDING', \`payload_json\` json NULL, \`response_json\` json NULL, \`xml\` mediumtext NULL, \`hash\` varchar(255) NULL, \`cdr_zip\` mediumtext NULL, \`sunat_code\` varchar(30) NULL, \`sunat_description\` text NULL, \`sunat_notes\` json NULL, \`error_message\` text NULL, \`sent_at\` datetime NULL, \`accepted_at\` datetime NULL, \`rejected_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_c51624f9c97ca2bfff34370904\` (\`company_id\`, \`document_type\`, \`series\`, \`number\`), INDEX \`IDX_8f26632d75be35098ba8672c34\` (\`sale_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`business_profile\` (\`id\` int NOT NULL AUTO_INCREMENT, \`ruc\` varchar(11) NULL, \`razon_social\` varchar(200) NULL, \`nombre_comercial\` varchar(200) NULL, \`direccion\` varchar(255) NULL, \`ubigueo\` varchar(6) NULL, \`codigo_pais\` varchar(2) NOT NULL DEFAULT 'PE', \`departamento\` varchar(100) NULL, \`provincia\` varchar(100) NULL, \`distrito\` varchar(100) NULL, \`urbanizacion\` varchar(150) NULL, \`cod_local\` varchar(10) NULL, \`email\` varchar(150) NULL, \`telephone\` varchar(30) NULL, \`billing_plan\` varchar(20) NOT NULL DEFAULT 'free', \`billing_environment\` varchar(30) NOT NULL DEFAULT 'beta', \`apis_peru_company_id\` int NULL, \`sol_user\` varchar(100) NULL, \`sol_pass\` text NULL, \`client_id\` text NULL, \`client_secret\` text NULL, \`certificado_base64\` mediumtext NULL, \`certificado_filename\` varchar(180) NULL, \`certificado_updated_at\` datetime NULL, \`logo_base64\` mediumtext NULL, \`logo_filename\` varchar(180) NULL, \`logo_updated_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD \`ubigeo\` varchar(6) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD \`department\` varchar(120) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD \`province\` varchar(120) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD \`district\` varchar(120) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD \`urbanization\` varchar(150) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD \`country_code\` varchar(2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`electronic_documents\` ADD CONSTRAINT \`FK_8f26632d75be35098ba8672c34e\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`electronic_documents\` DROP FOREIGN KEY \`FK_8f26632d75be35098ba8672c34e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` DROP COLUMN \`country_code\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` DROP COLUMN \`urbanization\``,
    );
    await queryRunner.query(`ALTER TABLE \`clients\` DROP COLUMN \`district\``);
    await queryRunner.query(`ALTER TABLE \`clients\` DROP COLUMN \`province\``);
    await queryRunner.query(
      `ALTER TABLE \`clients\` DROP COLUMN \`department\``,
    );
    await queryRunner.query(`ALTER TABLE \`clients\` DROP COLUMN \`ubigeo\``);
    await queryRunner.query(`DROP TABLE \`business_profile\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_8f26632d75be35098ba8672c34\` ON \`electronic_documents\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_c51624f9c97ca2bfff34370904\` ON \`electronic_documents\``,
    );
    await queryRunner.query(`DROP TABLE \`electronic_documents\``);
  }
}
