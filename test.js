const usb = require('usb');

const dev = usb.findByIds(0x04b8, 0x0046);
dev.open();
console.log(Object.keys(usb));

const iface = dev.interfaces[0];
iface.claim();

const epIn = iface.endpoints.find(e => e.direction === 'in');

epIn.transfer(64, (err, data) => {
    console.log(err);
    console.log(data);
});