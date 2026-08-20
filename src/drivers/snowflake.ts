import { createConnection, type Connection, type ConnectionOptions } from "snowflake-sdk";
import type { Driver, QueryResult } from "./types";

// Snowflake column types reported by stmt.getColumns().getType(),
// e.g. "NUMBER", "VARCHAR(16777216)", "TIMESTAMP_NTZ(9)", "FLOAT"
const SNOWFLAKE_TYPE_TO_HINT: { [x: string]: string } = {
  NUMBER: "decimal", DECIMAL: "decimal",
  INT: "integer", INTEGER: "integer", BIGINT: "integer",
  SMALLINT: "integer", TINYINT: "integer", BYTEINT: "integer",
  FLOAT: "float", FLOAT4: "float", FLOAT8: "float",
  DOUBLE: "float", "DOUBLE PRECISION": "float", REAL: "float",
  BOOLEAN: "boolean",
  DATE: "date",
  DATETIME: "timestamp", TIME: "timestamp", TIMESTAMP: "timestamp",
  TIMESTAMP_NTZ: "timestamp", TIMESTAMP_LTZ: "timestamp", TIMESTAMP_TZ: "timestamp",
};

// Accepts both the full domain (account.snowflakecomputing.com)
// and the short account form (myaccount).
function resolveAccount(host: string): string {
  if (host.endsWith(".snowflakecomputing.com")) {
    return host.split(".snowflakecomputing.com")[0]!;
  }
  return host;
}

// snowflake://user:pass@account/?warehouse=WH&database=DB&schema=SCHEMA&role=ROLE
export function parseConnectionString(connectionString: string): ConnectionOptions {
  const url = new URL(connectionString);

  const options: ConnectionOptions = {
    account: resolveAccount(url.hostname),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };

  for (const key of ["warehouse", "database", "schema", "role", "authenticator"]) {
    const value = url.searchParams.get(key);
    if (value) {
      (options as { [x: string]: string })[key] = value;
    }
  }

  return options;
}

function buildTypeHints(columns: { name: string; type: string }[]): { [x: string]: string } {
  const hints: { [x: string]: string } = {};
  for (const c of columns) {
    const baseType = c.type.split("(")[0]!.toUpperCase();
    const hint = SNOWFLAKE_TYPE_TO_HINT[baseType];
    if (hint) {
      hints[c.name] = hint;
    }
  }
  return hints;
}

export function createSnowflakeDriver(connectionString: string): Driver {
  const connection: Connection = createConnection(parseConnectionString(connectionString));

  const connect = (): Promise<void> =>
    new Promise((resolve, reject) => {
      connection.connect((err) => (err ? reject(err) : resolve()));
    });

  const destroy = (): Promise<void> =>
    new Promise((resolve, reject) => {
      connection.destroy((err) => (err ? reject(err) : resolve()));
    });

  return {
    type: "snowflake",

    async execute(query: string): Promise<QueryResult> {
      await connect();

      const result = await new Promise<{ rows: unknown[]; columns: { name: string; type: string }[] }>(
        (resolve, reject) => {
          connection.execute({
            sqlText: query,
            complete: (err, stmt, rows) => {
              if (err) {
                return reject(err);
              }
              const columns = (stmt.getColumns() ?? []).map(c => ({
                name: c.getName(),
                type: c.getType(),
              }));
              resolve({ rows: rows ?? [], columns });
            },
          });
        }
      );

      await destroy();

      return {
        rows: result.rows,
        columnNames: result.columns.map(c => c.name),
        typehints: buildTypeHints(result.columns),
      };
    },

    async close(): Promise<void> {
      if (connection.isUp()) {
        await destroy();
      }
    },
  };
}
