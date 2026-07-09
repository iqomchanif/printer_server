const mqtt = require('mqtt');
const escpos = require('escpos');
const USB = require('escpos-usb');
const { exec } = require('child_process');
const axios = require('axios');
const util = require("util");

// Konversi `exec` agar bisa digunakan dengan `await`
const execPromise = util.promisify(exec);
require('dotenv').config();
const version = '2.3.4';

const fs = require('fs').promises;

const path = require('path');
const { sprintf } = require('sprintf-js');

// Hubungkan ke broker MQTT di VPS
const toko_id = process.env.TOKO_ID;
const kode_vb = process.env.KODE_VB;
const name_server = process.env.NAME_SERVER;
const server_lokal = 'mqtt://127.0.0.1';
const server_vps = 'mqtt://34.19.24.73';
const server = process.env.SERVER;
const client = mqtt.connect(server); // Ganti dengan IP VPS kamu

let macaddress = "";
var printers = [];
var antrianNota = [];
console.log(`trying to connect ${server}`);
client.on('connect', () => {
    console.log(`✅ Terhubung ke MQTT Broker! ${server}`);
    client.subscribe('print/cetak-on-' + toko_id, (err) => {
        if (!err) {
            console.log("✅ Listening for print requests... print/cetak-on-" + toko_id);
        }
    });


});


async function sendPrintersToServer() {
    while (printers.length === 0 || macaddress === "") {
        console.log("⏳ Data printer atau MAC address belum siap, dicoba lagi dalam 8 detik...");
        // Tunggu 8 detik
        await delay(8000);
        // Coba dapatkan printer lagi setelah 8 detik
        printers = await getPrinter();

    }
    console.log("mengirim data printer ...");
    axios.post(name_server + '/api/printer/create-printer', {
        printers: printers.join(','),
        name: toko_id,
        mac_address: macaddress,
    })
    .then(response => {
            if (response.data.status == 1)
                console.log("✅ Data printer berhasil dikirim ke server:", response.data);
            else {
                console.log("❌ gagal mengirim data printer:", response.data.message);
                console.log("coba mengirim lagi dalam 5 detik");
                setTimeout(() => {
                    sendPrintersToServer();
                }, 5000);
            }
        })
        .catch(error => {
            console.error("❌ Gagal mengirim data printer:", error.message);
            console.log("coba mengirim lagi dalam 5 detik");
            setTimeout(() => {
                sendPrintersToServer();
            }, 5000);

        });
}

async function getDataNota(id,type){
    response= await axios.get(name_server + '/api/printer/get-data-nota?id=' + id+'&type='+type);
    if (response.data.status == 1) {
        console.log("✅ Data nota berhasil didapatkan:", response.data);
        return (response.data.data);
    }
    else {
        console.log("❌ gagal mendapatkan data nota:", response.data.message);
        return [];
    }
}

async function successPrint(task_id){
      response= await axios.get(name_server + '/api/printer/success-job-printer/'+task_id);

}

async function failedPrint(task_id){
      response= await axios.get(name_server + '/api/printer/failed-job-printer/'+task_id);

}

function getMacAddress() {
    console.log("🔍 trying get MAC Address ...");
    exec(`ip link show | grep -E "wlan|wlp|enp|elp|wlo|wlx" -A1 | grep ether | awk '{print $2}'`, (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Gagal mendapatkan MAC Address:", error.message);
            return;
        }
        if (stderr) {
            console.error("⚠️ Error:", stderr);
            return;
        }
        macaddress = stdout.trim().split("\n")[0]; // Ambil MAC address pertama yang ditemukan
        if (macaddress == "") {
            console.log("MAC address belum ditemukan, coba lagi stelah 5 detik");
            setTimeout(getMacAddress, 5000);
        }
        console.log("🔍 MAC Address:", stdout.trim());
    });
}

getMacAddress();

// let commandPrinter=`lpstat -p | grep "printer_nota" | awk \'{print $2}\'`;

async function getPrinter() {
    try {
        // const commandPrinter = `bash -c 'awk "NR==FNR{a[\\$2]; next} \\$4 in a && \\$3 ~ /printer_nota/ {sub(/:$/, \\"\\", \\$3); print \\$3}" <(lpinfo -v) <(lpstat -v)'`;
        // // Menjalankan perintah dan menunggu hasilnya
        // const { stdout } = await execPromise(commandPrinter, { shell: "/bin/bash" });

        // // Parsing hasil ke array
        // const printers = stdout.trim().split("\n").filter(Boolean);
        printer= await execPromise(`ls /dev/usb | grep "lp"`);
        printers=printer.stdout.trim().split("\n").filter(Boolean);        
        console.log("🖨️ Printer yang tersedia:", printers);
        return printers;
    } catch (error) {
        console.error(`❌ Gagal mendapatkan printer: ${error.message}`);
        return [];
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


(async () => {
    printers = await getPrinter();
    sendPrintersToServer();
    cekNota();
})();

client.on('message', (topic, message) => {
    console.log("ada permintaan cetak " + topic);
    if (topic === 'print/cetak-on-' + toko_id) {
        const data = JSON.parse(message);
        console.log("ada permintaan cetak " + topic);
        if (data.mac_address == macaddress) {
            //jika mac address sesuai jalankan       
            console.log("✅ MAC address sesuai, memproses permintaan cetak:");    
            if (data.type == 'invoice' || data.type =='surat-jalan') {
                console.log("🖨️ Menambahkan nota ke antrian:", data);
                antrianNota.push(data);
            }else if(data.type=='pembatalan'){
                task_id=data.task_id;
                //cari data dengan task_id di antrianNota
                index=antrianNota.findIndex(item => item.task_id === task_id);
                if(index !== -1){
                    antrianNota.splice(index, 1);
                    console.log("🗑️ Nota dengan task_id", task_id, "dihapus dari antrian.");
                }else{
                    console.log("⚠️ Nota dengan task_id", task_id, "tidak ditemukan di antrian.");
                }
            }
        }
    }
});



const fsPrinter = require("fs");


var mulaiProses;
async function cekNota(){
    
    console.log("⏳ Mengecek antrian nota...");
    if(antrianNota.length >0){
        //mulai proses cetak yaa
        dataNota=antrianNota.shift();
        textNota= await getDataNota(dataNota.id,dataNota.type);
        printerName=dataNota.printer_name;
        strname= printerName.split("_")[1];
        devPrinterName= "/dev/usb/" + strname;
        if (fsPrinter.existsSync(devPrinterName)) {
            console.log("🖨️ Mencetak nota ke printer:", printerName);
            await printNota(textNota,devPrinterName,dataNota.task_id);
        }
    }
    setTimeout(cekNota, 1000); // Cek setiap 1 detik
}


async function printNota(alltext, devPrinterName,taskID) {
    try{
    texts=JSON.parse(alltext);
    // await execPromise(`printf "\\033@\\033g\\0330\\033\\103\\x29" > /tmp/print.prn`);
    // await execPromise(`printf "\\033@\\033g\\0330\\033C\\x29" > /tmp/print.prn`);
    tinggiBaris=42;
    await execPromise(`printf "\\033@\\033g\\0330\\033C\\051" > /tmp/print.prn`);

    const fs = require('fs/promises');

    for (const text of texts) {
        console.log(text);
        await fs.appendFile('/tmp/print.prn', text + '\n');
        // await execPromise(`printf '${text}\\r\\n' >> /tmp/print.prn`);
        tinggiBaris--;
    }
    while(tinggiBaris > 0){
        await execPromise(`printf '\\r\\n' >> /tmp/print.prn`);
        tinggiBaris--;
    }
      await execPromise(`printf '\\r\\n' >> /tmp/print.prn`);
     await execPromise(`printf '\\r\\n' >> /tmp/print.prn`);
    // await execPromise(`printf '\\014' >> /tmp/print.prn`);
     console.log(`🖨️ Mencetak nota ke printer ke ${devPrinterName}`);
     await printByManual(devPrinterName);
    await successPrint(taskID);
     await new Promise(resolve => setTimeout(resolve, 2000));
    

    }catch(error){
        console.error("❌ Gagal mencetak nota:", error.message);
        await failedPrint(taskID);
    }
}

async function printByManual(devPrinterName){
     await execPromise(`cat /tmp/print.prn > ${devPrinterName}`);
}
async function printByCUPS(){
    const { stdout } = await execPromise(`lp -d LX-310 -o raw /tmp/print.prn`);
    const jobId = stdout.match(/request id is (\S+)/)?.[1];

    while (true) {
    const { stdout: status } = await execPromise(`lpstat -W not-completed -o LX-310 || true`);

    if (!status.includes(jobId)) {
        break;
    }

    await new Promise(r => setTimeout(r, 500));
    }

    console.log('Job done:', jobId);
}


class EscP {

    static reset() {
        return Buffer.from([0x1B,0x40]);
    }

    static cpi15() {
        return Buffer.from([0x1B,0x67]);
    }

    static cpi12() {
        return Buffer.from([0x1B,0x4D]);
    }

    static cpi10() {
        return Buffer.from([0x1B,0x50]);
    }

    static line8() {
        return Buffer.from([0x1B,0x30]);
    }

    static FF(){
        return Buffer.from([0x0C]);
    }

    static init() {
        return Buffer.from([
            0x1B, 0x40,
            0x1B, 0x67,
            0x1B, 0x30,
            0x1B, 0x43, 41, // page length 36 lines, coba ubah 30/32/34/36
        ]);
    }

}