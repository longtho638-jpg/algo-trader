#!/bin/bash
echo "═══ CashClaw Daily Report — Day $1/14 ═══"
python -c "
from core.reporting import DryRunReporter
r = DryRunReporter('config/dry-run.yaml')
r.generate_daily_report()
"
