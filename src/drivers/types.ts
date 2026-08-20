export type ProviderType = "postgres" | "mysql" | "snowflake";

export interface DriverConfig {
  type: ProviderType;
  connectionString: string;
}

export interface QueryResult {
  rows: unknown[];
  columnNames: string[];
  typehints: { [column: string]: string };
}

export interface Driver {
  type: ProviderType;
  execute(query: string): Promise<QueryResult>;
  close(): Promise<void>;
}
