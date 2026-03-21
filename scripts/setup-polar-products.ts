import { Polar } from '@polar-sh/sdk';

const token = process.env.POLAR_API_TOKEN || 'polar_oat_vSE16jEUA9HK7KLcMuWvlDkTJ5Avdgp3JoGWq30Ila4';

async function main() {
  const polar = new Polar({ accessToken: token });

  // Get organization
  const orgs = await polar.organizations.list({});
  const org = orgs.result?.items?.[0];
  if (!org) {
    console.error('No organization found. Create one at https://dashboard.polar.sh');
    return;
  }
  console.log(`Org: ${org.name} (${org.id})`);

  // Create products
  const products = [
    {
      name: 'Algo-Trade Free',
      description: 'Paper trading, 1 strategy, basic dashboard',
      prices: [{ type: 'recurring' as const, amount: 0, currency: 'usd', interval: 'month' as const }],
    },
    {
      name: 'Algo-Trade Pro',
      description: '3 strategies, backtesting, optimizer, copy trading',
      prices: [{ type: 'recurring' as const, amount: 2900, currency: 'usd', interval: 'month' as const }],
    },
    {
      name: 'Algo-Trade Enterprise',
      description: 'Unlimited strategies, API access, webhooks, priority support',
      prices: [{ type: 'recurring' as const, amount: 19900, currency: 'usd', interval: 'month' as const }],
    },
  ];

  for (const p of products) {
    try {
      const result = await polar.products.create({
        name: p.name,
        description: p.description,
        prices: p.prices.map(pr => ({
          type: 'recurring',
          priceAmount: pr.amount,
          priceCurrency: pr.currency,
          recurringInterval: pr.interval,
        })),
        organizationId: org.id,
      });
      console.log(`Created: ${result.name} → ${result.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed ${p.name}: ${msg}`);
    }
  }

  // List all products
  console.log('\n--- All Products ---');
  const all = await polar.products.list({ organizationId: org.id });
  for (const p of all.result?.items ?? []) {
    const price = p.prices?.[0];
    const amt = price && 'priceAmount' in price ? `$${(price.priceAmount ?? 0) / 100}/mo` : 'free';
    console.log(`${p.name}: ${p.id} (${amt})`);
  }
}

main().catch(e => console.error('Fatal:', e.message));
