#!/usr/bin/env bash
# Persistent DNS fix for M1 Max (resets on reboot)
set -euo pipefail
networksetup -setdnsservers Wi-Fi 8.8.8.8 1.1.1.1
echo 'DNS set: 8.8.8.8 1.1.1.1'
# Verify
networksetup -getdnsservers Wi-Fi
