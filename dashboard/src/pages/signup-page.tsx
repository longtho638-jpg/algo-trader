/**
 * Signup page — email, password, tier radio cards.
 * Pre-selects tier from ?tier= query param.
 * Stores session in auth-store, redirects to /app.
 */
import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { PublicNavbar } from '../components/public-navbar';

type Tier = 'free' | 'pro' | 'enterprise';

const TIERS: { value: Tier; label: string; price: string }[] = [
  { value: 'free', label: 'Free', price: '$0' },
  { value: 'pro', label: 'Pro', price: '$49/mo' },
  { value: 'enterprise', label: 'Enterprise', price: '$199/mo' },
];

export function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const signup = useAuthStore((s) => s.signup);

  const initialTier = (searchParams.get('tier') as Tier) ?? 'free';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tier, setTier] = useState<Tier>(
    TIERS.some((t) => t.value === initialTier) ? initialTier : 'free'
  );
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    signup(email.trim(), tier);
    navigate('/app');
  }

  return (
    <div className="min-h-screen bg-[#0F0F1A] font-mono flex flex-col">
      <PublicNavbar />

      <div className="flex-1 flex items-center justify-center px-4 pt-16 py-10">
        <div className="w-full max-w-md">
          <div className="bg-[#1A1A2E] border border-[#2D3142] rounded-lg p-8">
            {/* Header */}
            <div className="mb-6">
              <p className="text-[#00D9FF] text-xs uppercase tracking-widest mb-2">Get started</p>
              <h1 className="text-white text-xl font-bold">Create your account</h1>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 bg-[#FF3366]/10 border border-[#FF3366]/30 rounded text-[#FF3366] text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full bg-[#0F0F1A] border border-[#2D3142] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00D9FF] placeholder:text-[#8892B0]/50 transition-colors"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min 8 characters"
                  autoComplete="new-password"
                  className="w-full bg-[#0F0F1A] border border-[#2D3142] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00D9FF] placeholder:text-[#8892B0]/50 transition-colors"
                />
              </div>

              {/* Tier selector */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-2">Plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIERS.map(({ value, label, price }) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setTier(value)}
                      className={`flex flex-col items-center py-3 px-2 rounded border text-xs transition-colors ${
                        tier === value
                          ? 'border-[#00D9FF] bg-[#00D9FF]/10 text-[#00D9FF]'
                          : 'border-[#2D3142] text-[#8892B0] hover:border-[#00D9FF]/40 hover:text-white'
                      }`}
                    >
                      <span className="font-bold mb-0.5">{label}</span>
                      <span className="text-[10px] opacity-70">{price}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#00D9FF] text-[#0F0F1A] font-bold text-sm py-2.5 rounded hover:bg-[#00D9FF]/80 transition-colors"
              >
                Create Account
              </button>
            </form>

            <p className="text-[#8892B0] text-xs text-center mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-[#00D9FF] hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
