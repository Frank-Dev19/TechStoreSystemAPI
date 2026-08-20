import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class MailSettings1787097600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('mail_settings')) return;
    await queryRunner.createTable(new Table({
      name: 'mail_settings',
      columns: [
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'purpose', type: 'varchar', length: '40', isUnique: true },
        { name: 'host', type: 'varchar', length: '180' },
        { name: 'port', type: 'int' },
        { name: 'encryption', type: 'varchar', length: '20', default: "'STARTTLS'" },
        { name: 'username', type: 'varchar', length: '180' },
        { name: 'password_encrypted', type: 'text', isNullable: true },
        { name: 'from_name', type: 'varchar', length: '120' },
        { name: 'from_email', type: 'varchar', length: '180' },
        { name: 'reply_to', type: 'varchar', length: '180', isNullable: true },
        { name: 'subject_template', type: 'varchar', length: '180', isNullable: true },
        { name: 'intro_text', type: 'text', isNullable: true },
        { name: 'footer_text', type: 'text', isNullable: true },
        { name: 'is_active', type: 'boolean', default: true },
        { name: 'last_tested_at', type: 'datetime', isNullable: true },
        { name: 'last_test_successful', type: 'boolean', isNullable: true },
        { name: 'last_test_message', type: 'varchar', length: '500', isNullable: true },
        { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
      ],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('mail_settings')) await queryRunner.dropTable('mail_settings');
  }
}
