import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export const connections: Array<{
  filename: string;
  readonly: boolean;
  readwrite: boolean;
  create: boolean;
  queries: string[];
  closed: boolean;
  inTransaction: boolean[];
  asyncTransactions: boolean[];
}> = [];
export const busy = { remaining: 0, attempted: () => {} };

// A native Node database behind Bun's synchronous surface, not a mock of counting logic.
export class NodeBunDatabase {
  static setCustomSQLite(_file: string): void {}
  readonly db: DatabaseSync;
  readonly record: (typeof connections)[number];
  constructor(
    filename: string,
    options: { readonly: boolean; readwrite: boolean; create: boolean },
  ) {
    this.db = new DatabaseSync(filename, { readOnly: options.readonly });
    this.record = {
      filename,
      ...options,
      queries: [],
      closed: false,
      inTransaction: [],
      asyncTransactions: [],
    };
    connections.push(this.record);
  }
  get inTransaction() {
    return this.db.isTransaction;
  }
  close() {
    this.db.close();
    this.record.closed = true;
  }
  run(sql: string) {
    this.record.queries.push(sql);
    this.db.exec(sql);
  }
  query(sql: string) {
    this.record.queries.push(sql);
    // Inject busy retries into transcript snapshots, not the covering-index inventory queries.
    if (/from\s+session_message\s+where\s+session_id=\?/iu.test(sql) && busy.remaining > 0) {
      busy.remaining -= 1;
      busy.attempted();
      throw Object.assign(new Error("Synthetic lock"), { code: "SQLITE_BUSY", errno: 5 });
    }
    const statement = this.db.prepare(sql);
    const all = (...params: SQLInputValue[]) => {
      this.record.inTransaction.push(this.db.isTransaction);
      queueMicrotask(() => {
        this.record.asyncTransactions.push(!this.record.closed && this.db.isTransaction);
      });
      if (!statement.columns().length) {
        statement.run(...params);
        return [];
      }
      return statement.all(...params);
    };
    return {
      safeIntegers: (use: boolean) => statement.setReadBigInts(use),
      all,
      values: (...params: SQLInputValue[]) => all(...params).map((row) => Object.values(row)),
    };
  }
}
