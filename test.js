const { usb } = require('usb');
(async () => {
    const dev = await usb.findDeviceByIds(0x04b8, 0x0046);

    console.log(dev);

    
    dev.open();
    console.log(Object.keys(dev));

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
})();