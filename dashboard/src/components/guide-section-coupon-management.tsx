/**
 * Guide section: Daily Operations — customer-facing monitoring.
 */
import { CopyBlock } from './guide-shared-components';

export function GuideDailyOps() {
  return (
    <section id="daily-ops">
      <h2 className="text-xl font-bold font-mono text-white mb-1">Daily Operations</h2>
      <p className="text-sm font-mono text-[#8892B0] mb-4">5 min/day to keep your bot healthy.</p>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-mono text-[#00D9FF] uppercase tracking-widest mb-2">Check status</p>
          <CopyBlock code="pm2 status" />
        </div>
        <div>
          <p className="text-xs font-mono text-[#00D9FF] uppercase tracking-widest mb-2">View logs</p>
          <CopyBlock code="pm2 logs cashclaw --lines 30" />
        </div>
        <div>
          <p className="text-xs font-mono text-[#00D9FF] uppercase tracking-widest mb-2">Check portfolio</p>
          <p className="text-sm font-mono text-[#8892B0]">Open <span className="text-[#00D9FF]">polymarket.com</span> &rarr; My Portfolio &rarr; verify positions and P&L.</p>
        </div>
        <div>
          <p className="text-xs font-mono text-[#00D9FF] uppercase tracking-widest mb-2">Update bot</p>
          <CopyBlock code={`cd ~/algo-trader
git pull origin main
pnpm install --ignore-scripts
pm2 restart cashclaw`} />
        </div>
      </div>
    </section>
  );
}
