/**
 * Message Templates — All Indonesian response messages
 * Casual, friendly tone with emoji
 */

export const templates = {
  // === REGISTRATION ===
  welcome: () =>
    `🏍️ Halo! Mau jadi driver NEMU Ojek?\nKetik nama lengkap kamu:`,

  askVehicleType: (name: string) =>
    `Salam kenal ${name}! 👋\nPake motor atau mobil?`,

  askVehicleBrand: () =>
    `Oke 👍 Merk & tipe apa?\nContoh: Honda Beat, Yamaha NMAX`,

  askPlate: (vehicle: string) =>
    `${vehicle} 👍\nNomor plat berapa?`,

  askKtp: () =>
    `Sekarang kirim foto KTP kamu 📸\nFoto biasa aja, yang penting keliatan jelas`,

  askSim: () =>
    `✅ Diterima!\nKirim juga foto SIM C kamu`,

  askPaymentMethod: () =>
    `✅ Lengkap!\n\nTerakhir — kamu mau terima bayaran lewat apa?\n\n1. OVO\n2. GoPay\n3. Dana\n4. Transfer bank`,

  askPaymentNumber: (method: string) =>
    `Nomor ${method} kamu berapa?`,

  confirmRegistration: (data: {
    name: string;
    vehicle: string;
    plate: string;
    paymentMethod: string;
    paymentNumber: string;
  }) =>
    `Oke! Cek dulu ya datanya:\n\n👤 ${data.name}\n🏍️ ${data.vehicle} (${data.plate})\n💳 ${data.paymentMethod} ${data.paymentNumber}\n\nUdah bener? Ketik OKE`,

  registrationSuccess: (name: string) =>
    `🎉 Selamat ${name}! Udah terdaftar!\n\nGampang kok cara pakainya:\n\n✅ Ketik MULAI = siap terima order\n⛔ Ketik STOP = istirahat\n💰 Ketik GAJI = cek penghasilan\n❓ Ketik HELP = butuh bantuan\n\nMau langsung mulai? Ketik MULAI`,

  registrationFailed: (error: string) =>
    `❌ Maaf, pendaftaran gagal: ${error}\nCoba lagi nanti ya, atau ketik HELP buat bantuan.`,

  alreadyRegistered: () =>
    `Kamu udah terdaftar kok! 😊\nKetik MULAI buat mulai narik.`,

  // === ONLINE/OFFLINE ===
  goOnline: (name: string) =>
    `✅ Kamu ONLINE ${name}!\nTunggu order masuk ya...`,

  goOnlineNeedGps: (name: string, gpsUrl: string) =>
    `✅ Kamu ONLINE ${name}!\n\n📍 Biar dapet order, buka link ini buat share lokasi:\n${gpsUrl}\n\nTunggu order masuk ya...`,

  goOffline: (stats: { orders: number; earnings: number; rating: number; hours: number }) =>
    `✅ Kamu OFFLINE\n\n📊 Hari ini:\n🏍️ ${stats.orders} order\n💰 Rp ${stats.earnings.toLocaleString("id-ID")}\n⭐ Rating ${stats.rating}\n🕐 Online ${stats.hours} jam\n\nCapek ya? Istirahat dulu 💪\nBesok ketik MULAI lagi ya!`,

  goOfflineSimple: () =>
    `✅ Kamu OFFLINE\nIstirahat dulu ya 💪 Ketik MULAI kapan aja buat narik lagi.`,

  alreadyOnline: () =>
    `Kamu udah online kok! Tunggu order masuk ya... 🏍️`,

  alreadyOffline: () =>
    `Kamu udah offline kok. Ketik MULAI kalau mau narik lagi.`,

  needRegistration: () =>
    `Kamu belum terdaftar nih. Ketik DAFTAR dulu ya! 😊`,

  // === ORDER ===
  newOrder: (order: {
    customerName: string;
    pickupAddress: string;
    pickupDistance: string;
    dropoffAddress: string;
    dropoffDistance: string;
    price: number;
    rideCode: string;
  }) =>
    `🔔 ADA ORDER!\n\n📍 Jemput: ${order.customerName}\n   ${order.pickupAddress}\n   (${order.pickupDistance} dari kamu)\n\n📍 Antar: ${order.dropoffAddress}\n   ${order.dropoffDistance}\n\n💰 Kamu dapet: Rp ${order.price.toLocaleString("id-ID")}\n\nMau ambil? Balas YA atau GAK`,

  orderAccepted: (pickup: { customerName: string; address: string; mapsUrl?: string }) =>
    `✅ Order kamu!\n\n📍 Jemput ${pickup.customerName} di:\n${pickup.address}\n${pickup.mapsUrl ? `\n🗺️ Buka Maps:\n${pickup.mapsUrl}\n` : ""}\nUdah sampe? Ketik SAMPE`,

  orderDeclined: () =>
    `👍 Oke, order dilewatin.\nTunggu order berikutnya ya...`,

  orderTimeout: () =>
    `⏰ Order udah expired.\nTunggu order berikutnya ya...`,

  arrivedAtPickup: (customerName: string) =>
    `👍 ${customerName} udah dikasih tau kamu di depan.\nPenumpang naik? Ketik JALAN`,

  rideStarted: (dropoff: { address: string; mapsUrl?: string }) =>
    `🛣️ Anter ke ${dropoff.address}\n${dropoff.mapsUrl ? `\n🗺️ Buka Maps:\n${dropoff.mapsUrl}\n` : ""}\nUdah nyampe tujuan? Ketik DONE`,

  rideCompleted: (stats: { price: number; rating?: number; todayOrders: number; todayEarnings: number }) =>
    `✅ Order selesai!\n\n💰 Rp ${stats.price.toLocaleString("id-ID")} masuk ke saldo${stats.rating ? `\n⭐ Bintang ${stats.rating}!` : ""}\n\n📊 Hari ini: ${stats.todayOrders} order | Rp ${stats.todayEarnings.toLocaleString("id-ID")}\n\nTunggu order berikutnya ya...`,

  // === EARNINGS ===
  earnings: (data: {
    name: string;
    todayEarnings: number;
    todayOrders: number;
    weekEarnings: number;
    weekOrders: number;
    withdrawable: number;
    paymentMethod: string;
  }) =>
    `💰 Penghasilan ${data.name}\n\nHari ini:   Rp ${data.todayEarnings.toLocaleString("id-ID")} (${data.todayOrders} order)\nMinggu ini: Rp ${data.weekEarnings.toLocaleString("id-ID")} (${data.weekOrders} order)\nBisa ditarik: Rp ${data.withdrawable.toLocaleString("id-ID")}\n\nMau tarik ke ${data.paymentMethod}? Balas TARIK`,

  earningsSimple: (todayOrders: number, todayEarnings: number) =>
    `💰 Penghasilan hari ini:\n🏍️ ${todayOrders} order\n💰 Rp ${todayEarnings.toLocaleString("id-ID")}\n\nKetik TARIK buat cairkan saldo.`,

  // === WITHDRAWAL ===
  withdrawSuccess: (amount: number, method: string, number: string) =>
    `✅ Rp ${amount.toLocaleString("id-ID")} dikirim ke ${method} ${number}\nMasuk 1-5 menit ya 👍`,

  withdrawNoBalance: () =>
    `Saldo kamu masih kosong nih. Narik dulu ya! 💪`,

  // === HELP ===
  help: () =>
    `Gampang kok! 😊\n\nMULAI → siap terima order\nSTOP  → istirahat\nGAJI  → cek penghasilan\nTARIK → tarik saldo\n\nKalau lagi order:\nSAMPE → udah di lokasi jemput\nJALAN → penumpang udah naik\nDONE  → udah nyampe tujuan\n\nAda yang mau ditanya lagi?`,

  // === ERRORS ===
  invalidState: (expected: string) =>
    `Hmm, kamu belum bisa ngelakuin itu sekarang. ${expected}`,

  notOnRide: () =>
    `Kamu gak lagi dalam order nih. Ketik MULAI buat mulai narik.`,

  genericError: () =>
    `Maaf, ada error nih 😅 Coba lagi ya.`,

  unknownCommand: () =>
    `Hmm, aku gak ngerti nih 🤔\nKetik HELP buat liat daftar perintah.`,

  // === AI FALLBACK ===
  aiThinking: () =>
    `⏳ Bentar ya, aku pikirin dulu...`,

  aiError: () =>
    `Maaf, aku gak bisa jawab itu sekarang 😅\nKetik HELP buat bantuan.`,
};

export type TemplateKey = keyof typeof templates;
