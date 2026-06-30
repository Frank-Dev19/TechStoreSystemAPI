import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOptionsWhere, In, ObjectLiteral, Repository } from 'typeorm';

type SoftDeletableEntity = ObjectLiteral & {
  id: number;
  deletedAt?: Date | null;
};

export function ensureBulkIdsProvided(ids: number[]) {
  if (!ids?.length) {
    throw new BadRequestException('No ids provided');
  }
}

export async function ensureBulkSoftDeleteTargets<T extends ObjectLiteral>(
  repository: Repository<T>,
  ids: number[],
  notFoundMessage: (ids: number[]) => string,
): Promise<number> {
  ensureBulkIdsProvided(ids);

  const count = await repository.count({
    where: { id: In(ids) } as unknown as FindOptionsWhere<T>,
  });

  if (!count) {
    throw new NotFoundException(notFoundMessage(ids));
  }

  return count;
}

export async function findRestoreTargetOrThrow<T extends SoftDeletableEntity>(
  repository: Repository<T>,
  id: number,
  notFoundMessage: string,
): Promise<T> {
  const entity = await repository.findOne({
    where: { id } as unknown as FindOptionsWhere<T>,
    withDeleted: true,
  });

  if (!entity) {
    throw new NotFoundException(notFoundMessage);
  }

  return entity;
}

export async function findBulkRestoreTargetsOrThrow<
  T extends SoftDeletableEntity,
>(
  repository: Repository<T>,
  ids: number[],
  bulkNotFoundMessage: (ids: number[]) => string,
  singleNotFoundMessage: (id: number) => string,
): Promise<T[]> {
  ensureBulkIdsProvided(ids);

  const count = await repository.count({
    where: { id: In(ids) } as unknown as FindOptionsWhere<T>,
    withDeleted: true,
  });

  if (!count) {
    throw new NotFoundException(bulkNotFoundMessage(ids));
  }

  return Promise.all(
    ids.map((id) =>
      findRestoreTargetOrThrow(repository, id, singleNotFoundMessage(id)),
    ),
  );
}
