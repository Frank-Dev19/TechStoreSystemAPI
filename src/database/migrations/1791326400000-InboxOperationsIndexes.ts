import { MigrationInterface, QueryRunner } from 'typeorm';

export class InboxOperationsIndexes1791326400000 implements MigrationInterface {
  name = 'InboxOperationsIndexes1791326400000';
  async up(queryRunner: QueryRunner): Promise<void> {
    // Refuse to discard historical messages if duplicates need manual reconciliation.
    const duplicates = await queryRunner.query(
      'SELECT external_message_id FROM service_order_inbox_messages WHERE external_message_id IS NOT NULL GROUP BY external_message_id HAVING COUNT(*) > 1 LIMIT 1',
    );
    if (duplicates.length)
      throw new Error(
        'Inbox: reconcile duplicate external message IDs before applying indexes',
      );
    await queryRunner.query(
      'CREATE INDEX IDX_inbox_messages_thread_cursor ON service_order_inbox_messages (thread_id, id)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX UQ_inbox_messages_external_id ON service_order_inbox_messages (external_message_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IDX_inbox_threads_last_message ON service_order_inbox_threads (last_message_at, id)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IDX_inbox_threads_last_message ON service_order_inbox_threads',
    );
    await queryRunner.query(
      'DROP INDEX UQ_inbox_messages_external_id ON service_order_inbox_messages',
    );
    await queryRunner.query(
      'DROP INDEX IDX_inbox_messages_thread_cursor ON service_order_inbox_messages',
    );
  }
}
