const { DateTime } = require("luxon");
const { QueryTypes } = require("sequelize");
const { sendSms } = require('./sms/send-sms');
const excel = require("exceljs");
const fs = require("fs");

const {
  getSequelizeInstance,
  radiusDatabaseCredentials,
  helpdeskDatabaseCredentials,
} = require("./helpers/connect-to-db");

const sequelizeRadius = getSequelizeInstance(radiusDatabaseCredentials);
const sequelizeHelpdesk = getSequelizeInstance(helpdeskDatabaseCredentials);

function padTo2Digits(num) {
  return num.toString().padStart(2, "0");
}

function formatDate(date) {
  return (
    [
      date.getFullYear(),
      padTo2Digits(date.getMonth() + 1),
      padTo2Digits(date.getDate()),
    ].join("-") +
    " " +
    [
      padTo2Digits(date.getHours()),
      padTo2Digits(date.getMinutes()),
      padTo2Digits(date.getSeconds()),
    ].join(":")
  );
}

async function getHelpdeskUser() {
  let helpDeskResult = await sequelizeHelpdesk.query(
    `SELECT id, login FROM res_users WHERE login = 'support@bee.net.tn'`,
    {
      type: QueryTypes.SELECT,
      logging: console.log,
      benchmark: true
    }
  );
  return helpDeskResult[0];
}

// get ticket list from helpdesk
async function getDataFromHelpdesk() {
  console.log("--------- get data from helpdesk -----------");
  const subjects =
    "'Pas de synchro', 'Pas de synchro suite transfert', 'Pas de synchro suite migration VDSL', 'Pas de synchro_Vol de cable', 'Pas de synchro_cable sous terrain', 'Pas de synchro MES', 'Pas de synchro MES_Vol de cable', 'Pas de synchro MES_cable sous terrain', 'Pas de synchro MES_Cable 5/1 non installé', 'Pas d''accès', 'Pas d''accès MES', 'Pas d''accès suite migration VDSL', 'Pas d''accès suite transfert', 'Pas d''accès_MAC 0005', 'Port inversé', 'Port inversé MES', 'Port inversé suite transfert', 'Port inversé suite migration VDSL'";
  return await sequelizeHelpdesk.query(
    `SELECT ticket.id, ticket.create_date, x_phone, x_gsm,  
                                              ticket_category.name as ticket_category_name
                                              FROM public.helpdesk_ticket as ticket
                                              LEFT JOIN public.helpdesk_ticket_category as ticket_category 
                                              ON ticket.category_id = ticket_category.id
                                              WHERE ticket_category.name IN (${subjects}) AND stage_id IN (3,8,10)
                                              ORDER BY ticket.create_date desc;`,
    { type: QueryTypes.SELECT, logging: false, }
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
    logging: false
  });

  let lastStopPromise = sequelizeRadius.query(lastStopQuery, {
    type: QueryTypes.SELECT,
    logging: false
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
  let day = date.get('day').toString().length == 2 ? date.get('day').toString() : '0' + date.get('day').toString();
  let month = date.get('month').toString().length == 2 ? date.get('month').toString() : '0' + date.get('month').toString();
  let year = date.get('year');
  let hour = date.get('hour').toString().length == 2 ? date.get('hour').toString() : '0' + date.get('hour').toString();
  let minute = date.get('minute').toString().length == 2 ? date.get('minute').toString() : '0' + date.get('minute').toString();
  let second = date.get('second').toString().length == 2 ? date.get('second').toString() : '0' + date.get('second').toString();
  let formattedDate = `${day}/${month}/${year} ${hour}:${minute}:${second}`;
  return formattedDate;
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

    const HALF_HOUR_WITH_MILLISECONDS_SECONDS = 1800000;
    if (
      stopInstanceStart &&
      DateTime.fromFormat(created_date_formatted, "dd/MM/yyyy hh:mm:ss") <=
      DateTime.fromFormat(stopInstanceStartFormatted, "dd/MM/yyyy hh:mm:ss")
    ) {
      ticketToClose.push({
        ...ticket,
        create_date: created_date_formatted,
        connection_date: stopInstanceStartFormatted,
        check: 1,
      });
    } else if (
      lastAuthInstance?.acctstatustype == "Start" &&
      DateTime.fromFormat(created_date_formatted, "dd/MM/yyyy hh:mm:ss") <=
      DateTime.fromFormat(
        lastAuthInstanceStartFormatted,
        "dd/MM/yyyy hh:mm:ss"
      ) &&
      now.diff(lastAuthInstanceStart).milliseconds >
      HALF_HOUR_WITH_MILLISECONDS_SECONDS
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
  return { ticketToClose };
}

async function createExcelFile(ticketToClose, gsmList) {
  let workbook = new excel.Workbook();
  let workbookGsm = new excel.Workbook();

  let worksheet = workbook.addWorksheet("ticket-to-close");
  let worksheetSms = workbookGsm.addWorksheet("sms");

  worksheetSms.columns = [
    { header: "MSISDN", key: "x_gsm", width: 30 }
  ];

  worksheet.columns = [
    { header: "id", key: "id", width: 20 },
    { header: "create_date", key: "create_date", width: 20 },
    { header: "x_phone", key: "x_phone", width: 20 },
    {
      header: "ticket_category_name",
      key: "ticket_category_name",
      width: 20,
    },
    { header: "connection_date", key: "connection_date", width: 30 },
    { header: "check", key: "check", width: 30 },
  ];

  worksheet.addRows(ticketToClose);
  worksheetSms.addRows(gsmList);
  await workbookGsm.csv.writeFile("gsm.csv");
  await workbook.xlsx.writeFile("ticket-to-close.xlsx");
}

async function updateTicketStatus(ticketIds, helpDeskUser) {
  let userId = helpDeskUser.id;
  let now = new Date();
  now.setHours(now.getHours() - 1);
  let formattedDate = formatDate(now);
  let updateHelpdeskTicketQuery = `UPDATE public.helpdesk_ticket
                                   SET closed_date = '${formattedDate}', last_stage_update = '${formattedDate}', stage_id = 9, write_uid = ${userId}
                                   WHERE id IN ${ticketIds}`;

  await sequelizeHelpdesk.query(updateHelpdeskTicketQuery, {
    type: QueryTypes.UPDATE,
  });
}

function getTicketIds(ticketList) {
  let ticketIds = [];
  ticketIds = ticketList.map((ticket) => ticket.id);
  let formattedIds = "(";
  ticketIds.map((id) => {
    formattedIds += id + ",";
  });
  formattedIds = formattedIds.slice(0, -1) + ")";
  return formattedIds;
  // return ticketIds;
}

function getGsmListFromTickets(ticketToClose) {
  let gsmList = [];
  let ticketWithoutGsm = [];
  ticketToClose.forEach(ticket => {
    if (ticket.x_gsm) {
      gsmList.push({ "x_gsm": `216${ticket.x_gsm}`});
    } else {
      ticketWithoutGsm.push(ticket);
    }
  });

  return { gsmList, ticketWithoutGsm };
}

async function autoticketclose() {
  console.log("-------------------- START CRON -----------------------");
  console.time("startCron");
  let fileExists = fs.existsSync("ticket-to-close.xlsx");
  if (fileExists) {
    fs.unlinkSync("ticket-to-close.xlsx");
    console.log("excel file removed");
  }

  let gsmExists = fs.existsSync("gsm.csv");
  if (gsmExists) {
    fs.unlinkSync("gsm.csv");
    console.log("gsm file removed");
  }
  let to = ["majdi.bouakroucha@bee.net.tn", "alaeddine.hellali@bee.net.tn"];
  let cc = [
    "seif.mejri@bee.net.tn",
    "fatouma.hamdouni@bee.net.tn",
    "bilel.askri@bee.net.tn",
  ];
  try {
    let helpDeskUser = await getHelpdeskUser();
    let ticketList = await getDataFromHelpdesk();
    if (ticketList.length == 0) {
      console.log('No tickets to close');
      return;
    }
    let phones = getPhonesFromHelpdesk(ticketList);
    let { lastAuths, lastStops } = await getDataFromRadacct(phones);
    let { ticketToClose } = await filterTicketToClose(
      lastAuths,
      lastStops,
      ticketList
    );
    console.log(ticketToClose.length);
    if (ticketToClose.length > 0) {
      let ticketIds = getTicketIds(ticketToClose);
      let { gsmList, ticketWithoutGsm } = getGsmListFromTickets(ticketToClose)
      await createExcelFile(ticketToClose, gsmList);
      console.log(gsmList.length);
      // await sendEmail(to, cc);
      await updateTicketStatus(ticketIds, helpDeskUser);
      sendSms('gsm.csv');
      console.log("ticket closed successfully!");
    } else {
      console.log("does not exist tickets to close");
    }
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
 

module.exports = { autoticketclose };
