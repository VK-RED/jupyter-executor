import net from "node:net";
import express from "express";
import { Client, type FieldDef, types, DatabaseError } from "pg";
import { middleware } from "./middleware";

net.setDefaultAutoSelectFamily(false);

// Return raw strings for types with no inherent timezone —
// avoids pg's local-timezone Date conversion distorting the value.
types.setTypeParser(1082, val => val); // date        -> "2024-07-10"
types.setTypeParser(1114, val => val); // timestamp   -> "2024-07-10 18:30:00"

const DB_CONFIGS: { [x: string]: string } = JSON.parse(process.env.DATABASE_CONFIGS!);
const PORT = 8080;
const app = express();
app.use(express.json())
app.use(middleware);

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

function buildTypeHints(fields: FieldDef[]) {
  const hints: { [x: string]: string } = {};
  for (const f of fields) {
    const hint = OID_TO_HINT[f.dataTypeID];
    if (hint) {
      hints[f.name] = hint;
    }
  }
  return hints;
}

async function executeQuery(query: string, keyword: string) {
  const DB_URL = DB_CONFIGS[keyword];
  if (!DB_URL) {
    throw new Error("Invalid Keyword");
  }
  const client = new Client({
    connectionString: DB_URL,
    connectionTimeoutMillis: 10000
  });

  await client.connect();

  const res = await client.query(query);
  const typehints = buildTypeHints(res.fields)

  await client.end();

  return {
    rows: res.rows,
    columnNames: res.fields.map(f => f.name),
    typehints,
  }
}

app.post("/query", async (req, res) => {

  try {

    const body = req.body;

    if (!body.query || !body.integrationId) {
      return res.status(402).json({
        status: "error",
        message: "Missing query or Integration Id",
      });
    }

    const integrationExists = !!DB_CONFIGS[body.integrationId];

    if (!integrationExists) {
      return res.status(402).json({
        status: "error",
        message: "Invalid Integration Id",
      });
    }

    const result = await executeQuery(body.query, body.integrationId);

    return res.json({
      status: "ok",
      ...result,
    });

  } catch (error) {

    if (error instanceof DatabaseError) {
      return res.status(412).json({
        status: "error",
        message: error.message,
      })
    }

    console.log("Error while handling executing query endpoint");
    console.log(error);

    return res.status(512).json({
      status: "error",
      message: "Internal server error",
    })
  }
});

app.listen(PORT, () => {
  console.log(`Executor is running on the port: ${PORT}`);
})
