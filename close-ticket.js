const { DateTime } = require("luxon");
const { QueryTypes } = require("sequelize");
const fs = require('fs');
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

async function getDataFromRadacct(phones) {
  const HALF_HOUR = (1 / 2) * 3600 * 1000;
  let radacctData = await sequelizeRadius.query(
    `SELECT radacctid, acctstatustype, acctstarttime, acctstoptime, acctsessiontime, tel_adsl 
     FROM radacct 
     WHERE tel_adsl IN ${phones} AND acctstoptime IS NOT NULL AND acctsessiontime >= ${HALF_HOUR}
     ORDER BY acctstarttime DESC;`,
    { type: QueryTypes.SELECT }
  );
  return radacctData;
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

function filterTicketToClose(ticketList, dataFromRadius) {
  let ticketToClose = [];
  ticketList.forEach((ticket) => {
    let index = 0;
    let isConnected = false;
    let creationHelpdeskDate = convertJSDate(ticket.create_date, "utc+1");
    fs.appendFileSync('close.log','phone: ' + ticket.x_phone + ' create_date: ' + creationHelpdeskDate.toFormat("yyyy/MM/dd: hh:mm:ss") +"\r\n")
    // console.log(creationHelpdeskDate.toFormat("yyyy/MM/dd: hh:mm:ss"));
    while (index < dataFromRadius.length && isConnected == false) {
      let radacctStartDate = convertJSDate(
        dataFromRadius[index].acctstarttime,
        "utc"
      );
      // console.log(index, radacctStartDate.toFormat("yyyy/MM/dd hh:mm:ss"));
      fs.appendFileSync('close.log', 'phone: ' + dataFromRadius[index].tel_adsl + ' start_date: ' + radacctStartDate.toFormat("yyyy/MM/dd hh:mm:ss") + "\r\n");
      if (
        creationHelpdeskDate <= radacctStartDate &&
        ticket.x_phone == dataFromRadius[index].tel_adsl
      ) {
        isConnected = true;
        ticketToClose.push(ticket);
      } else {
        index++;
      }
    }
    fs.appendFileSync('close.log', '\r\n------------------------\r\n');
  });

  return ticketToClose;
}

async function autoticketclose() {
  try {
    let ticketList = await getDataFromHelpdesk();
    let phones = getPhonesFromHelpdesk(ticketList);
    let dataFromRadius = await getDataFromRadacct(phones);

    let ticketToClose = filterTicketToClose(ticketList, dataFromRadius);
    console.log(ticketToClose);
  } catch (error) {
    console.error(error);
  }
}

module.exports = { autoticketclose };
