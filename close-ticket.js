const { DateTime } = require("luxon");
const { QueryTypes } = require("sequelize");
const excel = require("exceljs");
const fs = require("fs");

const {
  getSequelizeInstance,
  radiusDatabaseCredentials,
  historicRadiusDatabaseCredentials,
  helpdeskDatabaseCredentials,
} = require("./helpers/connect-to-db");

const sequelizeRadius = getSequelizeInstance(radiusDatabaseCredentials);

// const sequelizeHistoricRadius = getSequelizeInstance(
//   historicRadiusDatabaseCredentials
// );

const sequelizeHelpdesk = getSequelizeInstance(helpdeskDatabaseCredentials);

// get ticket list from helpdesk
async function getDataFromHelpdesk() {
  console.log("--------- get data from helpdesk -----------");
  subjects =
    "'Pas de synchro', 'Pas de synchro suite transfert', 'Pas de synchro suite migration VDSL', 'Pas de synchro_Vol de cable', 'Pas de synchro_cable sous terrain', 'Pas de synchro MES', 'Pas de synchro MES_Vol de cable', 'Pas de synchro MES_cable sous terrain', 'Pas de synchro MES_Cable 5/1 non installé', 'Pas d''accès', 'Pas d''accès MES', 'Pas d''accès suite migration VDSL', 'Pas d''accès suite transfert', 'Pas d''accès_MAC 0005', 'Port inversé', 'Port inversé MES', 'Port inversé suite transfert', 'Port inversé suite migration VDSL'";
  return await sequelizeHelpdesk.query(
    `SELECT ticket.id, ticket.create_date, x_phone,  
                                              ticket_category.name as ticket_category_name
                                              FROM public.helpdesk_ticket as ticket
                                              LEFT JOIN public.helpdesk_ticket_category as ticket_category 
                                              ON ticket.category_id = ticket_category.id
                                              WHERE ticket_category.name IN (${subjects}) AND stage_id IN (8,10)
                                              ORDER BY ticket.create_date desc;`,
    { type: QueryTypes.SELECT, logging: false }
  );
}

async function getDataFromRadacct(phones) {
  console.log("--------- get data from radacct -----------");

  let lastAuthQuery = `SELECT radacctid, acctstarttime as last_start, acctstoptime, acctstatustype, tel_adsl
  FROM radacct
  WHERE (radacctid, tel_adsl) IN
  (select max(radacctid),tel_adsl 
   FROM radacct 
   WHERE tel_adsl IN ${phones}
   GROUP BY tel_adsl)`;

  let lastStopQuery = `SELECT Max(acctstarttime) as last_start, acctstoptime, tel_adsl
  FROM radacct
  WHERE tel_adsl IN ${phones}
  AND acctstatustype = 'Stop'
  AND acctsessiontime >= 1800
  GROUP BY tel_adsl;`;

  let lastAuthPromise = sequelizeRadius.query(lastAuthQuery, {
    type: QueryTypes.SELECT,
  });

  let lastStopPromise = sequelizeRadius.query(lastStopQuery, {
    type: QueryTypes.SELECT,
  });

  let [lastAuths, lastStops] = await Promise.all([
    lastAuthPromise,
    lastStopPromise,
  ]);
  return { lastAuths, lastStops };
}

function getPhonesFromHelpdesk(ticketList) {
  let phones = `(`;
  ticketList.map((ticket) => {
    if (ticket.x_phone) {
      phones += "'" + ticket.x_phone.trim() + "'" + ",";
    }
  });
  phones = phones.slice(0, -1) + ")";
  return phones;
}

function convertJSDate(date, zone) {
  return DateTime.fromJSDate(date, { zone: zone });
}

// try this one for format date
function formatDateHuman(date) {
  return date.toLocaleString({
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    formatMatcher: "basic",
    hourCycle: "h24",
  });
}

async function filterTicketToClose(lastAuths, lastStops, ticketList) {
  console.log("------------ filter ticket to close -------------");
  let ticketToClose = [];
  let clientsNotConnected = [];
  let ticketWithoutTelAdsl = [];
  let lastAuthsMap = new Map();
  let lastStopsMap = new Map();
  let now = DateTime.now();
  lastAuths.forEach((data) => {
    if (data.tel_adsl) {
      lastAuthsMap.set(data.tel_adsl.toString(), data);
    }
  });

  lastStops.forEach((data) => {
    if (data.tel_adsl) {
      lastStopsMap.set(data.tel_adsl.toString(), data);
    }
  });

  for (const ticket of ticketList) {
    let x_phone = ticket.x_phone;
    if (!x_phone) {
      ticketWithoutTelAdsl.push(ticket);
      continue;
    }
    let created_date = convertJSDate(ticket.create_date, "utc+2");
    let created_date_formatted = formatDateHuman(created_date);
    // let created_date_formatted = created_date.toFormat("dd/MM/yyyy hh:mm:ss");

    let stopInstance = lastStopsMap.get(x_phone);
    let lastAuthInstance = lastAuthsMap.get(x_phone);

    let stopInstanceStart;
    let stopInstanceStartFormatted;
    if (stopInstance) {
      stopInstanceStart = convertJSDate(stopInstance.last_start, "utc");
      stopInstanceStartFormatted = formatDateHuman(stopInstanceStart);
    }

    let lastAuthInstanceStart;
    let lastAuthInstanceStartFormatted;
    if (lastAuthInstance) {
      lastAuthInstanceStart = convertJSDate(lastAuthInstance.last_start, "utc");
      lastAuthInstanceStartFormatted = formatDateHuman(lastAuthInstanceStart);
    }

    if (
      stopInstanceStart &&
      DateTime.fromFormat(created_date_formatted, "MM/dd/yyyy, hh:mm:ss") <=
        DateTime.fromFormat(stopInstanceStartFormatted, "MM/dd/yyyy, hh:mm:ss")
    ) {
      ticketToClose.push({
        ...ticket,
        create_date: created_date_formatted,
        connection_date: stopInstanceStartFormatted,
        check: 1,
      });
    } else if (
      lastAuthInstance?.acctstatustype == "Start" &&
      DateTime.fromFormat(created_date_formatted, "MM/dd/yyyy, hh:mm:ss") <=
        DateTime.fromFormat(
          lastAuthInstanceStartFormatted,
          "MM/dd/yyyy, hh:mm:ss"
        ) &&
      now.diff(lastAuthInstanceStart).minutes > 29
    ) {
      ticketToClose.push({
        ...ticket,
        create_date: created_date_formatted,
        connection_date: lastAuthInstanceStartFormatted,
        check: 2,
      });
    } else {
      clientsNotConnected.push(ticket);
    }
  }
  return { ticketToClose, clientsNotConnected, ticketWithoutTelAdsl };
}

async function autoticketclose() {
  console.log("-------------------- START CRON -----------------------");
  console.time("startCron");
  try {
    let ticketList = await getDataFromHelpdesk();
    let phones = getPhonesFromHelpdesk(ticketList);
    let { lastAuths, lastStops } = await getDataFromRadacct(phones);
    let { ticketToClose, clientsNotConnected, ticketWithoutTelAdsl } =
      await filterTicketToClose(lastAuths, lastStops, ticketList);
    // let workbook = new excel.Workbook();
    // let worksheet = workbook.addWorksheet("ticket-to-close");
    // let worksheet2 = workbook.addWorksheet("clients-not-connected");
    // let worksheet3 = workbook.addWorksheet("ticket-without-tel-adsl");

    // worksheet.columns = [
    //   { header: "id", key: "id", width: 20 },
    //   { header: "create_date", key: "create_date", width: 20 },
    //   { header: "x_phone", key: "x_phone", width: 20 },
    //   {
    //     header: "ticket_category_name",
    //     key: "ticket_category_name",
    //     width: 20,
    //   },
    //   { header: "connection_date", key: "connection_date", width: 30 },
    //   { header: "check", key: "check", width: 30 },
    // ];

    // worksheet2.columns = [
    //   { header: "id", key: "id", width: 20 },
    //   { header: "create_date", key: "create_date", width: 20 },
    //   { header: "x_phone", key: "x_phone", width: 20 },
    //   {
    //     header: "ticket_category_name",
    //     key: "ticket_category_name",
    //     width: 20,
    //   },
    // ];

    // worksheet3.columns = [
    //   { header: "id", key: "id", width: 20 },
    //   { header: "create_date", key: "create_date", width: 20 },
    //   { header: "x_phone", key: "x_phone", width: 20 },
    //   {
    //     header: "ticket_category_name",
    //     key: "ticket_category_name",
    //     width: 20,
    //   },
    // ];

    // worksheet.addRows(ticketToClose);
    // worksheet2.addRows(clientsNotConnected);
    // worksheet3.addRows(ticketWithoutTelAdsl);
    // await workbook.xlsx.writeFile("ticket-to-close.xlsx");

    await updateTicketStatus(ticketToClose);
    console.log("ticket closed successfully!");
  } catch (error) {
    let now = DateTime.now().toFormat("yyyy-MM-dd hh:mm:ss");
    let errorMessage = `error at ${now}
                        ${error}
                        ------------------------- \n\n`;
    fs.appendFileSync("error.log", errorMessage);
    console.error(error);
  }
  console.timeEnd("startCron");
  console.log("-------------------- END CRON -----------------------");
}

async function updateTicketStatus(ticketsToClose) {
  // closed_date ==> new Date();
  // stage_id ==> 9

  let now = DateTime.now().toFormat("yyyy-MM-dd hh:mm:ss");
  let phones = getPhonesFromHelpdesk(ticketsToClose);
  let updateHelpdeskTicketQuery = `UPDATE public.helpdesk_ticket
                                   SET closed_date = '${now}', last_stage_update = '${now}', stage_id = 9
                                   WHERE x_phone IN ${phones}`;

  await sequelizeHelpdesk.query(updateHelpdeskTicketQuery, {
    type: QueryTypes.UPDATE,
  });
}

module.exports = { autoticketclose };
