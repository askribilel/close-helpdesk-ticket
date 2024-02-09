require("dotenv").config();
const cron = require("node-cron");
const { autoticketclose } = require("./close-ticket");
const { sendSms } = require("./sms/send-sms");

cron.schedule("03 20 * * *", () => {
  autoticketclose();
});

cron.schedule("03 09 * * *", () => {
  sendSms("gsm.csv");
})