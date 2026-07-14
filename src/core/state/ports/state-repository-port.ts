import type {
  CompareAndSetInput,
  CompareAndSetResult,
  EntityType,
  StateEntity
} from "../types";

export interface StateRepositoryPort {
  findById(entityType: EntityType, entityId: string, tenantId: string): Promise<StateEntity | null>;
  compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult>;
}
