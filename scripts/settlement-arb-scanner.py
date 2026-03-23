#!/usr/bin/env python3
"""
settlement-arb-scanner.py — Polymarket settlement arbitrage scanner.

Logic: buy YES/NO near-certain outcome at current price, collect $1.00 at settlement.
Profit = 1.00 - price - fees. Fee assumption: 2% taker (conservative).

API: Gamma API (gamma-api.polymarket.com)
Filter: active, not closed, end_date within 7 days, price > 0.85, volume > $1000
"""

import json
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

# --- Config ---
GAMMA_BASE = 'https://gamma-api.polymarket.com'
MARKETS_LIMIT = 500
DAYS_TO_SETTLEMENT = 7
MIN_PRICE_THRESHOLD = 0.85
MIN_VOLUME = 1_000
TAKER_FEE = 0.02
MAX_DISPLAY = 25


def fetch_markets():
    url = (
        f'{GAMMA_BASE}/markets'
        f'?limit={MARKETS_LIMIT}'
        f'&active=true'
        f'&closed=false'
        f'&order=endDate'
        f'&ascending=true'
    )
    req = urllib.request.Request(url, headers={'User-Agent': 'algo-trader/1.0'})
    try:
        raw = urllib.request.urlopen(req, timeout=20).read()
        return json.loads(raw)
    except Exception as e:
        print('[ERROR] Failed to fetch markets: %s' % e, file=sys.stderr)
        sys.exit(1)


def parse_end_date(market):
    for field in ('endDate', 'end_date_iso', 'end_date'):
        raw = market.get(field)
        if not raw:
            continue
        raw = str(raw).rstrip('Z')
        for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M', '%Y-%m-%d'):
            try:
                return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return None


def parse_prices(market):
    raw = market.get('outcomePrices', '[]')
    try:
        prices = json.loads(raw)
        if len(prices) < 2:
            return None
        return float(prices[0]), float(prices[1])
    except (json.JSONDecodeError, ValueError, TypeError):
        return None


def make_opportunity(price, side, question, end_dt, volume, liquidity, market_id):
    gross_profit = 1.00 - price
    net_profit = gross_profit - TAKER_FEE
    net_profit_pct = (net_profit / price) * 100
    days_left = (end_dt - datetime.now(timezone.utc)).total_seconds() / 86_400
    return {
        'id': market_id,
        'question': question[:60],
        'side': side,
        'buy_price': price,
        'gross_profit': gross_profit,
        'net_profit': net_profit,
        'net_profit_pct': net_profit_pct,
        'days_left': days_left,
        'end_date': end_dt.strftime('%Y-%m-%d %H:%M UTC'),
        'volume': volume,
        'liquidity': liquidity,
    }


def scan(markets):
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=DAYS_TO_SETTLEMENT)
    opportunities = []
    skipped_no_date = skipped_far = skipped_price = skipped_vol = 0

    for m in markets:
        end_dt = parse_end_date(m)
        if end_dt is None:
            skipped_no_date += 1
            continue
        if end_dt > cutoff:
            skipped_far += 1
            continue

        prices = parse_prices(m)
        if prices is None:
            continue
        yes_p, no_p = prices

        volume = float(m.get('volume', 0) or 0)
        if volume < MIN_VOLUME:
            skipped_vol += 1
            continue

        liquidity = float(m.get('liquidity', 0) or 0)
        question = (m.get('question') or m.get('title') or '?').strip()
        market_id = str(m.get('id', m.get('conditionId', '')))

        found = False
        if yes_p > MIN_PRICE_THRESHOLD:
            opportunities.append(make_opportunity(yes_p, 'YES', question, end_dt, volume, liquidity, market_id))
            found = True
        if no_p > MIN_PRICE_THRESHOLD:
            opportunities.append(make_opportunity(no_p, 'NO', question, end_dt, volume, liquidity, market_id))
            found = True
        if not found:
            skipped_price += 1

    print('[scan] Total fetched: %d' % len(markets))
    print('[scan] Skipped — no date: %d, far away: %d, low price: %d, low volume: %d'
          % (skipped_no_date, skipped_far, skipped_price, skipped_vol))
    return opportunities


def print_results(opps):
    if not opps:
        print('\nNo settlement arb opportunities found matching criteria.')
        print('Try relaxing: MIN_PRICE_THRESHOLD or MIN_VOLUME or DAYS_TO_SETTLEMENT')
        return

    opps.sort(key=lambda x: x['net_profit_pct'], reverse=True)
    now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

    print('\n' + '='*90)
    print('  POLYMARKET SETTLEMENT ARB SCANNER -- %s' % now_str)
    print('  Criteria: end <= %dd | price > %.2f | vol > $%s' % (DAYS_TO_SETTLEMENT, MIN_PRICE_THRESHOLD, '{:,}'.format(MIN_VOLUME)))
    print('  Fee assumption: %d%% taker | Settle at $1.00' % (TAKER_FEE * 100))
    print('='*90)

    hdr = '  %3s  %-4s  %6s  %7s  %5s  %10s  %9s  %-16s  %s' % (
        '#', 'SIDE', 'BUY', 'NET%', 'DAYS', 'VOLUME', 'LIQ', 'END DATE', 'QUESTION')
    print(hdr)
    print('  ' + '-'*85)

    for i, o in enumerate(opps[:MAX_DISPLAY], 1):
        sign = '+' if o['net_profit'] > 0 else '-'
        pct_str = '%s%.2f%%' % (sign, abs(o['net_profit_pct']))
        vol_str = '$%s' % '{:,.0f}'.format(o['volume'])
        liq_str = '$%s' % '{:,.0f}'.format(o['liquidity'])
        print('  %3d  %-4s  %.4f  %7s  %4.1fd  %10s  %9s  %-16s  %s' % (
            i, o['side'], o['buy_price'], pct_str,
            o['days_left'], vol_str, liq_str,
            o['end_date'][:16], o['question']
        ))

    print('  ' + '-'*85)

    profitable = [o for o in opps if o['net_profit'] > 0]
    if profitable:
        avg_net = sum(o['net_profit_pct'] for o in profitable) / len(profitable)
        best = profitable[0]
        print('\n  SUMMARY: %d profitable opportunities (net > 0 after %d%% fees)' % (len(profitable), TAKER_FEE * 100))
        print('  BEST:    %s %s' % (best['side'], best['question'][:50]))
        print('           buy @ %.4f -> net %.2fc profit (%.2f%%)' % (best['buy_price'], best['net_profit'] * 100, best['net_profit_pct']))
        print('           settles in %.1f days on %s' % (best['days_left'], best['end_date']))
        print('  AVG NET: %.2f%% across %d opps' % (avg_net, len(profitable)))
    else:
        print('\n  WARNING: All %d opportunities unprofitable after %d%% fees.' % (len(opps), TAKER_FEE * 100))
        print('  Prices may already reflect settlement value or fees are too high.')

    print('\n  RISK NOTES:')
    print('  - Settlement can be delayed or disputed on Polymarket')
    print('  - Liquidity may not fill large orders at quoted price')
    print('  - Actual fees vary (USDC gas + maker/taker spread)')
    print('  - Always verify market resolution criteria before trading')
    print('='*90 + '\n')


def main():
    print('Fetching Polymarket markets from Gamma API...')
    markets = fetch_markets()
    print('Loaded %d markets. Scanning for settlement arb...\n' % len(markets))
    opps = scan(markets)
    print_results(opps)


if __name__ == '__main__':
    main()
