/**
 * Guide section: Trading Parameters — configuration and tuning.
 */
import { CopyBlock } from './guide-shared-components';

export function GuideParameters() {
  return (
    <section id="parameters">
      <h2 className="text-xl font-bold font-mono text-white mb-4">Trading Parameters</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono border-collapse">
          <thead>
            <tr className="border-b border-[#2D3142]">
              <th className="text-left py-2 pr-6 text-[#00D9FF]">Parameter</th>
              <th className="text-left py-2 pr-4 text-[#00FF41]">Safe</th>
              <th className="text-left py-2 pr-4 text-[#00D9FF]">Optimal</th>
              <th className="text-left py-2 text-red-400">Dangerous</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2D3142]">
            <tr><td className="py-2 pr-6 text-white">MM_SPREAD</td><td className="py-2 pr-4 text-[#00FF41]">0.10</td><td className="py-2 pr-4">0.06-0.08</td><td className="py-2 text-red-400">&lt;0.04</td></tr>
            <tr><td className="py-2 pr-6 text-white">MM_SIZE</td><td className="py-2 pr-4 text-[#00FF41]">20</td><td className="py-2 pr-4">30-50</td><td className="py-2 text-red-400">&gt;100</td></tr>
            <tr><td className="py-2 pr-6 text-white">MM_MAX_MARKETS</td><td className="py-2 pr-4 text-[#00FF41]">5</td><td className="py-2 pr-4">8-10</td><td className="py-2 text-red-400">&gt;15</td></tr>
            <tr><td className="py-2 pr-6 text-white">MAX_BANKROLL</td><td className="py-2 pr-4 text-[#00FF41]">200</td><td className="py-2 pr-4">500-2000</td><td className="py-2 text-red-400">&gt;5000</td></tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-2 text-sm font-mono">
        <p className="text-white font-bold mb-2">Tuning Rules</p>
        <p>Fills &lt;3/day &rarr; reduce spread (tighter)</p>
        <p>Fills &gt;30/day &rarr; increase spread (wider)</p>
        <p>2-day consecutive loss &rarr; widen spread + reduce size</p>
      </div>
      <div className="mt-6">
        <p className="text-sm font-mono text-white font-bold mb-2">Fair Value Mode (Advanced)</p>
        <p className="text-sm font-mono text-[#8892B0] mb-2">Set your own probability estimate for better edge:</p>
        <CopyBlock code={`pnpm fv:list                           # List estimates
pnpm fv -- set will-btc-hit-100k 0.35 medium  # Set estimate
pnpm fv -- remove will-btc-hit-100k           # Remove`} />
      </div>
    </section>
  );
}
