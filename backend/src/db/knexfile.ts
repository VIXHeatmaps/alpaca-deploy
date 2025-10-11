import type { Knex } from "knex";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from root .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "postgresql",
    connection: process.env.DATABASE_URL || {
      host: "localhost",
      port: 5432,
      database: "alpaca_dev",
      user: "alpaca",
      password: "dev_password_change_in_production",
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
      directory: "./dist/db/migrations",
      extension: "js",
    },
    seeds: {
      directory: "./src/db/seeds",
      extension: "ts",
    },
    // Wrap JSON values for PostgreSQL
    wrapIdentifier: (value, origImpl) => origImpl(value),
    postProcessResponse: (result) => result,
  },

  production: {
    client: "postgresql",
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
      directory: "./dist/db/migrations",
      extension: "js",
    },
  },
};

export default config;
