const { usb } = require('usb');

(async () => {
  const dev = await usb.findDeviceByIds(0x04b8, 0x0046);

  await dev.open();

  if (!dev.configuration) {
    await dev.selectConfiguration(1);
  }

  await dev.claimInterface(0);

  // coba baca dari endpoint IN 0x82
  try {
    const result = await dev.transferIn(2, 64); // endpoint number 2, length 64
    console.log('status:', Buffer.from(result.data.buffer));
  } catch (e) {
    console.error('read error:', e);
  }

  await dev.close();
})();