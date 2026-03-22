# WhatsApp Bot (Baileys) - Nemu Ojek

Bot WhatsApp standalone untuk flow booking ride via chat.

## Fitur
- QR login di terminal (scan pakai HP nomor bot)
- Session disimpan di `whatsapp-bot/session/` (nggak perlu scan ulang)
- State machine booking per nomor penumpang:
  - `IDLE -> ASK_NAME -> ASK_PICKUP -> ASK_DESTINATION -> ASK_PAYMENT -> CONFIRM -> BOOKED`
- Simpan state ke `whatsapp-bot/states.json`
- Setelah konfirmasi `ya`, bot create ride via API Nemu Ojek
- Polling status ride lalu kirim update otomatis ke WhatsApp

## Jalankan
```bash
npm run whatsapp-bot
```

## Environment (optional)
- `NEMU_API_BASE` (default: `https://gojek-mvp.vercel.app/api`)

## Cara Scan QR
1. Jalankan `npm run whatsapp-bot`
2. QR muncul di terminal
3. Buka WhatsApp di HP bot -> Linked devices -> Link a device
4. Scan QR di terminal
5. Setelah connected, session tersimpan otomatis di `whatsapp-bot/session/`

## Trigger Chat
Ketik kata seperti:
- `halo`
- `pesan`
- `ojek`
- `ride`
