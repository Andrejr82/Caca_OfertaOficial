import type { AuditRecord } from "../types";

export interface AuditPort {
  register(record: AuditRecord): Promise<void>;
}
