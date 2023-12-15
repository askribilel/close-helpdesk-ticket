/**
 *
 * @param {*} host: database host
 * @param {*} database
 * @param {*} username
 * @param {*} password
 * @param {*} port
 * @param {*} dialect
 * @returns
 */
function getSequelizeInstance(dbCredentials) {
  return new Sequelize({
    host: dbCredentials.host,
    database: dbCredentials.database,
    username: dbCredentials.username,
    password: dbCredentials.password,
    port: dbCredentials.port,
    dialect: dbCredentials.dialect,
    logging: console.log,
  });
}

const radiusDatabaseCredentials = {
  host: process.env.radiusHost,
  database: process.env.radiusDatabase,
  username: process.env.radiusUserName,
  password: process.env.radiusPassword,
  port: 3306,
  dialect: "mysql",
};

const historicRadiusDatabaseCredentials = {
  host: process.env.radiusHost,
  database: process.env.radiusHistoricDatabase,
  username: process.env.radiusUserName,
  password: process.env.radiusPassword,
  port: 3306,
  dialect: "mysql",
};

const helpdeskDatabaseCredentials = {
  host: process.env.helpdeskHost,
  database: process.env.helpdeskDatabase,
  username: process.env.helpdeskUsername,
  password: process.env.helpdeskPassword,
  port: 5432,
  dialect: "postgres",
};

module.exports = {
  getSequelizeInstance,
  radiusDatabaseCredentials,
  historicRadiusDatabaseCredentials,
  helpdeskDatabaseCredentials,
};
