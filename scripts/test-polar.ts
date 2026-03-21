import { Polar } from '@polar-sh/sdk';

const token = process.env.POLAR_API_TOKEN || 'polar_oat_vSE16jEUA9HK7KLcMuWvlDkTJ5Avdgp3JoGWq30Ila4';

async function main() {
  // Try production
  console.log('Testing Polar production...');
  try {
    const polar = new Polar({ accessToken: token });
    const products = await polar.products.list({});
    console.log('Products:', products.result?.items?.length ?? 0);
    for (const p of products.result?.items ?? []) {
      console.log(` - ${p.name} (${p.id})`);
    }
    return;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Production error:', msg);
  }

  // Try sandbox
  console.log('\nTesting Polar sandbox...');
  try {
    const sandbox = new Polar({ accessToken: token, server: 'sandbox' });
    const products = await sandbox.products.list({});
    console.log('Sandbox products:', products.result?.items?.length ?? 0);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Sandbox error:', msg);
  }
}

main();
