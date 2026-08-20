import { createKnexDriver } from "./knex";
import { createSnowflakeDriver } from "./snowflake";
import type { Driver, DriverConfig, ProviderType, QueryResult } from "./types";

const factories: { [key in ProviderType]: (config: DriverConfig) => Driver } = {
  postgres: (config) => createKnexDriver("postgres", config.connectionString),
  mysql: (config) => createKnexDriver("mysql", config.connectionString),
  snowflake: (config) => createSnowflakeDriver(config.connectionString),
};

export function isSupportedType(type: string) {
  if (type !== "postgres" && type !== "mysql" && type !== "snowflake") {
    return false;
  }
  return true;
}

export async function executeQuery(config: DriverConfig, query: string): Promise<QueryResult> {
  const factory = factories[config.type];
  if (!factory) {
    throw new Error("Unsupported datasource type");
  }

  const driver = factory(config);

  try {
    return await driver.execute(query);
  } finally {
    await driver.close();
  }
}
