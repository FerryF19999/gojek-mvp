#!/bin/bash
pm2 logs nemu-wa-bot --lines 100 --nostream | grep -A 20 "QR"
