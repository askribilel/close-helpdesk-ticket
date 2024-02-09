const { exec } = require('child_process');

function sendSms(smsFilePath) {
    let gsmExists = fs.existsSync(smsFilePath);
    if (gsmExists) {
        // fs.unlinkSync("gsm.csv");
        // console.log("gsm file removed");
        let cmd = `curl -F "SPID=67" -F "LOGIN=Bee" -F "PASS=Bee!2019$" -F "SC=BEE" -F "TEXT=Cher client, BEE vous informe que votre connexion a ete retablie. Pour plus d informations, veuillez contacter notre service client." -F "CSV=@${smsFilePath}" http://41.226.169.210/API/sendcsv_wt.php`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
    }

}

module.exports = { sendSms };