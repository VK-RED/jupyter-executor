import express from "express";
import net from "node:net";
import { DatabaseError } from "pg";
import { middleware } from "./middleware";
import { executeQuery, isSupportedType } from "./src/drivers/registry";
import type { DriverConfig } from "./src/drivers/types";

net.setDefaultAutoSelectFamily(false);

const DB_CONFIGS: { [x: string]: DriverConfig } = JSON.parse(process.env.DATABASE_CONFIGS!);
const PORT = process.env.PORT || 8002;
const app = express();
app.use(express.json())

app.get("/", (_req, res) => {
  return res.send("Hello world !");
});

app.use(middleware);

app.post("/query", async (req, res) => {

  try {

    const body = req.body;

    if (!body.query || !body.integrationId) {
      return res.status(402).json({
        status: "error",
        message: "Missing query or Integration Id",
      });
    }

    const config = DB_CONFIGS[body.integrationId];

    if (!config || !isSupportedType(config.type)) {
      return res.status(402).json({
        status: "error",
        message: "Invalid Integration Id",
      });
    }

    const result = await executeQuery(config, body.query);

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

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
    ) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(412).json({
        status: "error",
        message,
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
