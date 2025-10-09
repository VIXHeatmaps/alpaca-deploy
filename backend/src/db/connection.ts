import knex from 'knex';
import config from '../../knexfile';

const environment = process.env.NODE_ENV || 'development';
const knexConfig = config[environment];

if (!knexConfig) {
  throw new Error(`No Knex configuration found for environment: ${environment}`);
}

const db = knex(knexConfig);

export default db;
