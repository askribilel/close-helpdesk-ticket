require("dotenv").config();
const cron = require("node-cron");
const { autoticketclose } = require("./close-ticket");
const { sendSms } = require("./sms/send-sms");

cron.schedule("03 14 * * *", async () => {
  await autoticketclose();
  sendSms('gsm.csv');
});

cron.schedule("03 23 * * *", async () => {
  await autoticketclose();
})

cron.schedule("03 09 * * *", () => {
  sendSms("gsm.csv");
})