/**
 * Guide section: Pricing & Payment — customer-facing tier info.
 */

export function GuidePricing() {
  return (
    <section id="pricing">
      <h2 className="text-xl font-bold font-mono text-white mb-4">Pricing & Payment</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#1A1A2E] border border-[#2D3142] rounded-lg p-4">
          <p className="text-white font-bold text-lg mb-1">Starter</p>
          <p className="text-[#00D9FF] font-bold text-2xl mb-3">$49<span className="text-sm text-[#8892B0]">/mo</span></p>
          <ul className="text-xs font-mono text-[#8892B0] space-y-1">
            <li>1 strategy &middot; Polymarket only</li>
            <li>5 markets max</li>
            <li>Community support</li>
          </ul>
        </div>
        <div className="bg-[#1A1A2E] border-2 border-[#00D9FF] rounded-lg p-4 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00D9FF] text-[#0D1117] px-3 py-0.5 rounded-full text-xs font-bold">Popular</div>
          <p className="text-white font-bold text-lg mb-1">Pro</p>
          <p className="text-[#00D9FF] font-bold text-2xl mb-3">$149<span className="text-sm text-[#8892B0]">/mo</span></p>
          <ul className="text-xs font-mono text-[#8892B0] space-y-1">
            <li>5 strategies + AI scanner</li>
            <li>All markets</li>
            <li>Priority support</li>
          </ul>
        </div>
        <div className="bg-[#1A1A2E] border border-yellow-500/50 rounded-lg p-4">
          <p className="text-white font-bold text-lg mb-1">Elite</p>
          <p className="text-yellow-400 font-bold text-2xl mb-3">$499<span className="text-sm text-[#8892B0]">/mo</span></p>
          <ul className="text-xs font-mono text-[#8892B0] space-y-1">
            <li>Unlimited strategies</li>
            <li>All markets</li>
            <li>Dedicated support</li>
          </ul>
        </div>
      </div>
      <p className="text-sm font-mono text-[#8892B0]">
        Pay with crypto via NOWPayments (USDT, BTC, ETH, 100+ coins) at <span className="text-[#00D9FF]">cashclaw.cc</span>.
        Have a coupon? Enter it on the pricing page before checkout.
      </p>
      <div className="mt-3 border border-[#00FF41]/30 bg-[#00FF41]/5 rounded-lg p-4">
        <p className="text-sm font-mono text-[#00FF41] font-bold mb-1">Free Tier</p>
        <p className="text-sm font-mono text-[#8892B0]">No license key = FREE: 1 market, 5 trades/day. Perfect for testing.</p>
      </div>
    </section>
  );
}
