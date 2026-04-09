#!/bin/bash
echo "═══ 14-Day Validation Criteria ═══"
python -c "
from core.reporting import DryRunReporter
r = DryRunReporter('config/dry-run.yaml')
results = r.get_summary()

criteria = {
    'Sharpe Ratio > 1.0': results['sharpe'] > 1.0,
    'Max Drawdown < 10%': results['max_drawdown'] < 0.10,
    'Win Rate > 52%': results['win_rate'] > 0.52,
    'Profit Factor > 1.2': results['profit_factor'] > 1.2,
    'Total Trades > 50': results['total_trades'] > 50,
    'No Circuit Breaker Hits': results['circuit_breaker_hits'] == 0,
}

passed = sum(criteria.values())
total = len(criteria)

for name, ok in criteria.items():
    print(f'  {\"✅\" if ok else \"❌\"} {name}: {\"PASS\" if ok else \"FAIL\"}')

print(f'\nResult: {passed}/{total} criteria met')
print(f'Verdict: {\"✅ VALIDATED — ready for live trading\" if passed == total else \"❌ NOT VALIDATED — need more tuning\"}')
"
