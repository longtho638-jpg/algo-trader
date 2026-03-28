/**
 * Guide section: Troubleshooting & Emergency — customer-facing help.
 */
import { CopyBlock, CollapsibleItem } from './guide-shared-components';

export function GuideTroubleshooting() {
  return (
    <section id="troubleshooting">
      <h2 className="text-xl font-bold font-mono text-white mb-4">Troubleshooting & Emergency</h2>
      <div className="space-y-6">
        <div className="space-y-2">
          <CollapsibleItem title="Bot stopped unexpectedly">
            <CopyBlock code={`pm2 logs cashclaw --lines 50
pm2 restart cashclaw`} />
          </CollapsibleItem>
          <CollapsibleItem title="Balance drop > 10%">
            <p className="text-red-400">STOP immediately. Widen spread before restart.</p>
            <CopyBlock code={`pm2 stop cashclaw
# Edit .env: MM_SPREAD=0.12, MM_SIZE=10
pm2 restart cashclaw`} />
          </CollapsibleItem>
          <CollapsibleItem title="401 Unauthorized error">
            <p>API keys expired. Regenerate on Polymarket, update .env, restart.</p>
          </CollapsibleItem>
          <CollapsibleItem title="No fills for 24+ hours">
            <p>Spread too wide. Reduce MM_SPREAD to 0.06 in .env and restart.</p>
          </CollapsibleItem>
        </div>
        <div>
          <p className="text-sm font-mono text-red-400 font-bold mb-3">Emergency Stop</p>
          <div className="space-y-3">
            <div><p className="text-sm font-mono text-[#00D9FF] font-bold mb-1">Level 1 — Quick stop</p><CopyBlock code="pm2 stop cashclaw" /></div>
            <div><p className="text-sm font-mono text-yellow-400 font-bold mb-1">Level 2 — Cancel all orders</p><CopyBlock code={`pm2 stop cashclaw\n# polymarket.com -> My Portfolio -> Cancel All`} /></div>
            <div><p className="text-sm font-mono text-red-400 font-bold mb-1">Level 3 — Full shutdown</p><CopyBlock code={`pm2 delete cashclaw\n# polymarket.com -> withdraw all USDC`} /></div>
          </div>
        </div>
        <div className="border border-[#00D9FF]/30 bg-[#00D9FF]/5 rounded-lg p-4">
          <p className="text-sm font-mono text-[#00D9FF] font-bold mb-1">Need Help?</p>
          <p className="text-sm font-mono text-[#8892B0]">Email: <span className="text-white">support@cashclaw.cc</span> &middot; Response: &lt;24h (Pro/Elite: &lt;4h)</p>
        </div>
      </div>
    </section>
  );
}
