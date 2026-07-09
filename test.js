const { usb } = require('usb');

const dev = usb.findByIds(0x04b8, 0x0046);

console.log(dev);

dev.open();

const iface = dev.interfaces[0];

// kalau error "kernel driver active", nanti perlu detach
if (iface.isKernelDriverActive()) {
  iface.detachKernelDriver();
}

iface.claim();

const epIn = iface.endpoints.find(e => e.direction === 'in');

console.log(epIn);

epIn.transfer(64, (err, data) => {
  console.log('err:', err);
  console.log('data:', data);
});