import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSunatCodeToDocumentTypes1784949676825 implements MigrationInterface {
  name = 'AddSunatCodeToDocumentTypes1784949676825';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('document_types', 'sunat_code')) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE \`document_types\` ADD \`sunat_code\` varchar(4) NULL AFTER \`digits\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('document_types', 'sunat_code'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE \`document_types\` DROP COLUMN \`sunat_code\``,
    );
  }
}
