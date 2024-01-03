require("dotenv").config();
const cron = require('node-cron');
const { autoticketclose } = require("./close-ticket");


cron.schedule('01 23 * * *', () => {
    autoticketclose();
});



