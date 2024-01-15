require("dotenv").config();
const cron = require("node-cron");
const fs = require("fs");
const { autoticketclose } = require("./close-ticket");

cron.schedule("03 23 * * *", () => {
  autoticketclose();
});
