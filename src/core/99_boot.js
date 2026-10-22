  // =====================================================================
  //  BOOT — สร้าง dock + drawer เมื่อ DOM พร้อม
  // =====================================================================
  SP.whenReady(function bootLoop() {
    if (document.body) SP.bootUI();
    else setTimeout(bootLoop, 200);
  });
