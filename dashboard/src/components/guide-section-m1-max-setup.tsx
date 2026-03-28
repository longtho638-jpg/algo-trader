/**
 * Guide section: Quick Start — customer VPS setup guide.
 */
import { CopyBlock, CollapsibleItem } from './guide-shared-components';

export function GuideQuickStart() {
  return (
    <section id="quick-start">
      <h2 className="text-xl font-bold font-mono text-white mb-2">Quick Start</h2>
      <p className="text-sm font-mono text-[#8892B0] mb-4">
        Setup takes ~15 minutes. You need: a Polymarket account, a VPS ($10-20/mo), and a terminal.
      </p>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-mono text-white mb-2"><span className="text-[#00D9FF] font-bold">Step 1:</span> Create Polymarket Wallet</p>
          <p className="text-sm font-mono text-[#8892B0]">Go to <span className="text-[#00D9FF]">polymarket.com</span> &rarr; connect wallet &rarr; save your <span className="text-yellow-400">PRIVATE KEY</span> securely. Fund with at least $100 USDC on Polygon.</p>
        </div>
        <div>
          <p className="text-sm font-mono text-white mb-2"><span className="text-[#00D9FF] font-bold">Step 2:</span> Rent a VPS</p>
          <p className="text-sm font-mono text-[#8892B0]">Any Linux VPS works. Recommended: DigitalOcean ($12/mo), Hetzner ($5/mo), or Vultr ($6/mo). 2GB+ RAM, Ubuntu 24.</p>
        </div>
        <div>
          <p className="text-sm font-mono text-white mb-2"><span className="text-[#00D9FF] font-bold">Step 3:</span> Install CashClaw</p>
          <CopyBlock code={`ssh root@YOUR_VPS_IP
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm pm2
git clone https://github.com/longtho638-jpg/algo-trader.git
cd algo-trader && git checkout main
pnpm install --ignore-scripts
cp .env.example .env`} />
        </div>
        <div>
          <p className="text-sm font-mono text-white mb-2"><span className="text-[#00D9FF] font-bold">Step 4:</span> Configure .env</p>
          <CopyBlock code={`PRIVATE_KEY=0x_your_private_key
DRY_RUN=true
MAX_BANKROLL=200
MM_SPREAD=0.10
MM_SIZE=20
MM_MAX_MARKETS=5
# RAAS_LICENSE_KEY=your_license_key_here`} />
        </div>
        <div>
          <p className="text-sm font-mono text-white mb-2"><span className="text-[#00D9FF] font-bold">Step 5:</span> Start the Bot</p>
          <CopyBlock code={`pm2 start "npx tsx src/app.ts" --name cashclaw
pm2 status
pm2 logs cashclaw --lines 30
pm2 save && pm2 startup`} />
        </div>
        <div>
          <p className="text-sm font-mono text-white mb-2"><span className="text-[#00D9FF] font-bold">Step 6:</span> Go Live</p>
          <p className="text-sm font-mono text-[#8892B0] mb-2">After 2-3 days of successful DRY_RUN:</p>
          <CopyBlock code={`# Edit .env: change DRY_RUN=false
nano .env
pm2 restart cashclaw`} />
        </div>
        <div>
          <CollapsibleItem title="Need detailed step-by-step? (VPN, wallet, USDC, everything)">
            <p>Go to <a href="/app/setup" className="text-[#00D9FF] hover:underline">Full Setup Guide</a> for a complete walkthrough from zero — including VPN setup (1.1.1.1), MetaMask wallet creation, buying USDC, AI model installation, and dashboard connection.</p>
          </CollapsibleItem>
        </div>
      </div>
    </section>
  );
}
