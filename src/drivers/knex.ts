import { knex, type Knex } from "knex";
import type { Driver, QueryResult } from "./types";
import { types } from "pg";

// Return raw strings for types with no inherent timezone —
// avoids pg's local-timezone Date conversion distorting the value.

types.setTypeParser(1082, val => val); // date        -> "2024-07-10"
types.setTypeParser(1114, val => val); // timestamp   -> "2024-07-10 18:30:00"

const OID_TO_HINT: { [x: number]: string } = {
  16: "boolean",
  20: "integer", 21: "integer", 23: "integer",
  700: "float", 701: "float",
  1700: "decimal",
  790: "decimal",   // money — optional
  1082: "date",
  1083: "timestamp", 1266: "timestamp",  // time/timetz — optional
  1114: "timestamp", 1184: "timestamp",
};

const MYSQL_TYPE_TO_HINT: { [x: number]: string } = {
  0x00: "decimal", 0xf6: "decimal",          // DECIMAL, NEWDECIMAL
  0x01: "integer", 0x02: "integer", 0x03: "integer",
  0x08: "integer", 0x09: "integer", 0x0d: "integer",  // TINY SHORT LONG LONGLONG INT24 YEAR
  0x04: "float", 0x05: "float",              // FLOAT DOUBLE
  0x0a: "date",                              // DATE
  0x07: "timestamp", 0x0b: "timestamp", 0x0c: "timestamp", // TIMESTAMP TIME DATETIME
};

type FieldMeta = { name: string; hint?: string };

function buildTypeHints(fields: FieldMeta[]): { [x: string]: string } {
  const hints: { [x: string]: string } = {};
  for (const f of fields) {
    if (f.hint) {
      hints[f.name] = f.hint;
    }
  }
  return hints;
}

function buildResult(rows: unknown[], fields: FieldMeta[]): QueryResult {
  return {
    rows,
    columnNames: fields.map(f => f.name),
    typehints: buildTypeHints(fields),
  };
}

export function createKnexDriver(type: "postgres" | "mysql", connectionString: string): Driver {
  const client = type === "postgres" ? "pg" : "mysql2";
  const instance: Knex = knex({
    client,
    connection: {
      connectionString: client === "pg" ? connectionString : undefined,
      uri: client === "mysql2" ? connectionString : undefined,
      dateStrings: true
    },
    pool: {
      min: 0,
      max: 1,
      acquireTimeoutMillis: 10000,
    },

  });

  return {
    type,

    async execute(query: string): Promise<QueryResult> {
      const response: unknown = await instance.raw(query);

      if (type === "postgres") {
        const result = response as { rows: unknown[]; fields: { name: string; dataTypeID: number }[] };
        const fields = (result.fields ?? []).map(f => ({
          name: f.name,
          hint: OID_TO_HINT[f.dataTypeID],
        }));
        return buildResult(result.rows ?? [], fields);
      }

      const result = response as [unknown[], { name: string; type: number, columnLength: number }[]];
      const [rows, fieldPackets] = result ?? [[], []];
      const fields = (fieldPackets ?? []).map(f => ({
        name: f.name,
        hint: f.type === 0x01
          ? (f.columnLength === 1 ? "boolean" : "integer")
          : MYSQL_TYPE_TO_HINT[f.type],
      }));
      return buildResult(rows ?? [], fields);
    },

    async close(): Promise<void> {
      await instance.destroy();
    },
  };
}
