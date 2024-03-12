require("dotenv").config();
const cron = require("node-cron");
const { autoticketclose } = require("./close-ticket");
const { deconnexionTicketClose } = require("./close-deconnexion-ticket");


deconnexionTicketClose();

cron.schedule("03 23 * * *", () => {
  autoticketclose();
});




