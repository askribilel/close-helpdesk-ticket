require("dotenv").config();
const cron = require("node-cron");
const { autoticketclose } = require("./close-ticket");

cron.schedule("56 * * * *", () => {
  autoticketclose();
});
