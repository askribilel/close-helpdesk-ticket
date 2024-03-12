require("dotenv").config();
const cron = require("node-cron");
const { autoticketclose } = require("./close-ticket");
const { deconnexionTicketClose } = require("./close-deconnexion-ticket");
const { sendSms } = require("./sms/send-sms");

cron.schedule("03 14 * * *", async () => {
  await autoticketclose();
  sendSms("gsm.csv");
});

cron.schedule("33 13 * * *", async () => {
  await deconnexionTicketClose();
  sendSms("gsm-deconnexion.csv");
});

cron.schedule("03 23 * * *", () => {
  autoticketclose();
});

cron.schedule("33 22 * * *", () => {
  deconnexionTicketClose();
});

cron.schedule("03 09 * * *", () => {
  sendSms("gsm.csv");
  sendSms("gsm-deconnexion.csv");
});
