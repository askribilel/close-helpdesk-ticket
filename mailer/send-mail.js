const nodemailer = require("nodemailer");

async function sendEmail(to, cc) {
  console.log(to);
  console.log(cc);
  let selfSignedConfig = {
    host: "mail.beemail.tn",
    port: 25,
    secure: false,
    igonreTLS: true,
    auth: {
      user: process.env.email,
      pass: process.env.password,
    },
  };


  let transporter = nodemailer.createTransport(selfSignedConfig);

  let mailOptions = {
    from: "smartradius@bee.net.tn", // sender
    to: to, // list of receivers (who receives)
    cc: cc,
    subject: "Close Helpdesk Tickets", // Subject line
    attachments: [{ path: "ticket-to-close.xlsx" }],
    text: `Good morning,
        You will find in this excel file the list of resolved tickets`,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("Message sent: %s", info.accepted);
}

module.exports = { sendEmail };
