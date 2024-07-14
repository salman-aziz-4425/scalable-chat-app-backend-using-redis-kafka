import { Repository, EntityTarget, FindOptionsWhere, FindOneOptions, DeepPartial } from 'typeorm';
import { Logger, NotFoundException } from '@nestjs/common';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

export abstract class AbstractRepository<TEntity> {
  protected abstract readonly logger: Logger;

  constructor(protected readonly repository: Repository<TEntity>) {}

  async create(entity: DeepPartial<TEntity>): Promise<TEntity> {
    const createdEntity = this.repository.create(entity);
    return await this.repository.save(createdEntity);
  }

  async findOne(options: FindOneOptions<TEntity>): Promise<TEntity> {
    const entity = await this.repository.findOne(options);
    if (!entity) {
      this.logger.warn('Entity was not found with provided options');
      throw new NotFoundException('Entity was not found');
    }
    return entity;
  }

  async find(options?: FindOptionsWhere<TEntity>): Promise<TEntity[]> {
    return this.repository.find(options);
  }

  async findOneAndUpdate(
    id: number,
    updateData: QueryDeepPartialEntity<TEntity>,
  ): Promise<TEntity> {
    await this.repository.update(id, updateData);
    return await this.findOne({ where: { id } as unknown as FindOptionsWhere<TEntity> });
  }

  async findOneAndDelete(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}
