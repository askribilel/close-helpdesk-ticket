const { DateTime } = require("luxon");
const { Sequelize, QueryTypes } = require("sequelize");
const {
  getSequelizeInstance,
  radiusDatabaseCredentials,
  historicRadiusDatabaseCredentials,
  helpdeskDatabaseCredentials,
} = require("./helpers/connect-to-db");

// connect to radius database
const sequelizeRadius = getSequelizeInstance(radiusDatabaseCredentials);
// connect to historic radius database
const sequelizeHistoricRadius = getSequelizeInstance(
  historicRadiusDatabaseCredentials
);
// connect to helpdesk database
const sequelizeHelpdesk = getSequelizeInstance(helpdeskDatabaseCredentials);

// get list ticket from helpdesk
async function getDataFromHelpdesk() {
  subjects =
    "'Pas de synchro', 'Pas de synchro suite transfert', 'Pas de synchro suite migration VDSL', 'Pas de synchro_Vol de cable', 'Pas de synchro_cable sous terrain', 'Pas de synchro MES', 'Pas de synchro MES_Vol de cable', 'Pas de synchro MES_cable sous terrain', 'Pas de synchro MES_Cable 5/1 non installé', 'Pas d''accès', 'Pas d''accès MES', 'Pas d''accès suite migration VDSL', 'Pas d''accès suite transfert', 'Pas d''accès_MAC 0005', 'Port inversé', 'Port inversé MES', 'Port inversé suite transfert', 'Port inversé suite migration VDSL'";
  return await sequelizeHelpdesk.query(
    `SELECT ticket.id, ticket.closed_date, ticket.create_date, x_phone,  
                                              ticket_category.name as ticket_category_name
                                              FROM public.helpdesk_ticket as ticket
                                              LEFT JOIN public.helpdesk_ticket_category as ticket_category 
                                              ON ticket.category_id = ticket_category.id
                                              WHERE ticket_category.name IN (${subjects}) AND ticket.closed_date IS null
                                              ORDER BY ticket.create_date desc;`,
    { type: QueryTypes.SELECT }
  );
}

// get data from radacct for the current month
async function getDataFromRadacct(phones) {
  return await sequelizeRadius.query(
    `SELECT radacctid, acctstatustype, acctstarttime, acctstoptime, tel_adsl 
     FROM radacct 
     WHERE tel_adsl IN (${phones})
     ORDER BY acctstarttime DESC;`,
    { type: QueryTypes.SELECT }
  );
}

async function getHistoRadius(telAdsl) {
  let [rows] = await sequelizeHistoricRadius.query("SHOW tables");
  let getDataFromHistoRadius = [];
  for (const result of rows) {
    let table = "`" + result["Tables_in_histo_radius"] + "`";
    let data = await sequelizeHistoricRadius.query(
      `select radacctid, acctstatustype, acctstarttime, acctstoptime from ${table}
                     where tel_adsl = '${telAdsl}' 
                     ORDER BY acctstarttime DESC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
  }
  return getDataFromHistoRadius;
}

async function autoticketclose() {
  try {
    getDataFromHelpdesk();

    // we need to filter phones from helpdesk
    getDataFromRadacct();

    getHistoRadius();

    async function ticketWillClose(telAdsl, startDate, endDate) {
      const HALF_HOUR = (1 / 2) * 3600 * 1000;

      const helpdeskData = await getDataFromHelpdesk();
      const radacctData = await getDataFromRadacct(telAdsl, startDate, endDate);
      const histoRadiusData = await getHistoRadius(telAdsl, startDate, endDate);

      let creationHelpDate = helpdeskData.create_date;
      let radacctStartDate = radacctData.acctstarttime;
      let histoStartDate = histoRadiusData.acctstarttime;

      let condition1 = creationHelpDate <= radacctStartDate;
      let condition2 = creationHelpDate <= histoStartDate;

      if (HALF_HOUR && condition1 && condition2) {
        const updateQuery = `UPDATE public.helpdesk_ticket 
          SET ticket.closed_date = CURRENT_TIMESTAMP, ticket.stage_id = 9 
           WHERE id = ${ticket.id} AND x_phone = ${telAdsl}`;
        await sequelizehelp.query(updateQuery, {
          type: Sequelize.QueryTypes.UPDATE,
        });
        console.log(`Ticket ${ticket.id} updated.`, updateQuery);
      }
    }

    ticketWillClose("71986149", "acctstarttime", "acctstoptime");
  } catch (error) {
    console.error("Error running query:", error);
  }
}

autoticketclose();

// const sequelizeRadius = new Sequelize({
//   host: process.env.radiusHost,
//   database: process.env.radiusDatabase,
//   username: process.env.radiusUserName,
//   password: process.env.radiusPassword,
//   port: 3306,
//   dialect: "mysql",
//   logging: console.log,
// });

// const sequelizeHistoricRadius = new Sequelize({
//   host: process.env.radiusHost,
//   database: process.env.radiusHistoricDatabase,
//   username: process.env.radiusUserName,
//   password: process.env.radiusPassword,
//   port: 3306,
//   dialect: "mysql",
//   logging: console.log,
// });

// const sequelizehelp = new Sequelize({
//   host: process.env.helpdeskHost,
//   database: process.env.helpdeskDatabase,
//   username: process.env.helpdeskUsername,
//   password: process.env.helpdeskPassword,
//   port: 5432,
//   dialect: "postgres",
//   logging: console.log,
// });
