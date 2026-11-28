import React, { useState } from 'react';
import {
  Shield,
  Zap,
  ArrowRight,
  Lock,
  Mail,
  Globe,
  FileText,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react';

interface DemoAuthLandingProps {
  onEnterWorkspace: (operator?: { email: string; role: string }) => void;
}

const DEMO_CAPITALS = ['London', 'Tokyo', 'New Delhi', 'Paris', 'Washington, D.C.', 'Berlin', 'Ottawa', 'Canberra'];

export const DemoAuthLanding: React.FC<DemoAuthLandingProps> = ({ onEnterWorkspace }) => {
  const [email, setEmail] = useState('inspector@archonix.io');
  const [password, setPassword] = useState('••••••••••••');
  const [role, setRole] = useState<'Structural Inspector' | 'Operations Lead'>('Structural Inspector');
  const [error, setError] = useState('');

  const handleOperatorSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Enter an operator email and password, or use Demo Workspace below.');
      return;
    }
    setError('');
    onEnterWorkspace({ email: email.trim(), role });
  };

  const handleFillDemo = () => {
    setEmail('inspector@archonix.io');
    setPassword('archonix-demo-2026');
    setError('');
  };

  return (
    <div className="min-h-screen w-full bg-[#090909] text-[#F5F0E5] grid grid-cols-1 lg:grid-cols-2 selection:bg-[#B58B3B]/40 selection:text-[#F5F0E5]">
      <div className="relative flex flex-col justify-between p-8 sm:p-12 lg:p-16 border-b lg:border-b-0 lg:border-r border-white/[0.06] bg-[#0D0D0D] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(#B58B3B_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-[#B58B3B]/10 blur-[110px]" />

        <div className="relative z-10 flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#E5C77B]/20 to-[#B58B3B]/5 border border-[#B58B3B]/40 flex items-center justify-center text-[#E5C77B] shadow-[0_0_25px_rgba(181,139,59,0.16)]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold tracking-[0.22em] text-sm text-[#F5F0E5]">ARCHONIX</div>
            <div className="text-[10px] font-mono tracking-[0.2em] text-[#B58B3B] uppercase">
              World Enterprise Telemetry
            </div>
          </div>
        </div>

        <div className="relative z-10 my-12 max-w-xl animate-screen-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-mono mb-6">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            Interactive Telemetry Sandbox • 8 Global Capitals Seeded
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-[#F5F0E5]">
            Buildings Have a Health.
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#F5E6BE] via-[#E5C77B] to-[#B58B3B] mt-1">
              We Monitor It.
            </span>
          </h1>

          <p className="mt-5 text-[#A7A39A] text-base sm:text-lg leading-relaxed">
            A structural asset workspace for recording inspection evidence, monitoring live spatial
            telemetry, and reviewing global building history in real time.
          </p>

          <div className="mt-7">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#7C7870] mb-2.5">
              Active Telemetry Nodes
            </div>
            <div className="flex flex-wrap gap-2">
              {DEMO_CAPITALS.map((city) => (
                <span
                  key={city}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-white/[0.03] border border-white/[0.08] text-[#D8D3C8]"
                >
                  {city}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <div className="grid grid-cols-3 gap-4 pt-8 border-t border-white/[0.06]">
            <div className="flex items-start gap-2.5">
              <ClipboardCheck className="h-4 w-4 text-[#E5C77B] shrink-0 mt-1" />
              <div>
                <div className="text-sm font-semibold text-[#E5C77B]">Manual</div>
                <div className="text-xs text-[#A7A39A] mt-0.5">Inspection Records</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Globe className="h-4 w-4 text-[#E5C77B] shrink-0 mt-1" />
              <div>
                <div className="text-sm font-semibold text-[#E5C77B]">GIS Map</div>
                <div className="text-xs text-[#A7A39A] mt-0.5">Incident Pinpointing</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <FileText className="h-4 w-4 text-[#E5C77B] shrink-0 mt-1" />
              <div>
                <div className="text-sm font-semibold text-[#E5C77B]">PDF</div>
                <div className="text-xs text-[#A7A39A] mt-0.5">Print-ready Reports</div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-xs text-[#7C7870] font-mono">
            © 2026 ARCHONIX World Enterprise Telemetry • Global Operations
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-12 bg-[#090909] overflow-hidden">
        <div className="pointer-events-none absolute h-96 w-96 rounded-full bg-[#B58B3B]/10 blur-[130px]" />

        <div className="relative w-full max-w-md rounded-2xl bg-[#121212]/90 border border-white/[0.08] p-7 sm:p-8 shadow-2xl shadow-black/60 backdrop-blur-xl animate-screen-in">
          <div className="flex items-center justify-between gap-2 mb-5">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#B58B3B]/15 border border-[#B58B3B]/35 text-[10px] font-mono font-semibold tracking-wider text-[#E5C77B] uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E5C77B]" />
              Command Center Access
            </span>

            <button
              type="button"
              onClick={handleFillDemo}
              className="inline-flex items-center gap-1 text-xs text-[#A7A39A] hover:text-[#E5C77B] transition-colors cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Auto-fill Demo
            </button>
          </div>

          <h2 className="text-2xl font-bold text-[#F5F0E5] tracking-tight">Explore the command center</h2>
          <p className="mt-1.5 text-sm text-[#A7A39A]">
            Sign in with operator credentials or launch directly into the pre-seeded global sandbox.
          </p>

          <form onSubmit={handleOperatorSignIn} className="mt-6 space-y-4">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#A7A39A] mb-1.5">Operator Email</label>
              <div className="relative">
                <Mail className="h-4 w-4 text-[#7C7870] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="inspector@archonix.io"
                  className="w-full rounded-lg bg-[#0B0B0B] border border-white/[0.08] pl-10 pr-3.5 py-2.5 text-sm text-[#F5F0E5] placeholder:text-[#5C5852] focus:outline-none focus:border-[#B58B3B]/70 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#A7A39A] mb-1.5">Access Passkey</label>
              <div className="relative">
                <Lock className="h-4 w-4 text-[#7C7870] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg bg-[#0B0B0B] border border-white/[0.08] pl-10 pr-3.5 py-2.5 text-sm text-[#F5F0E5] placeholder:text-[#5C5852] focus:outline-none focus:border-[#B58B3B]/70 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#A7A39A] mb-1.5">Session Profile</label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#0B0B0B] border border-white/[0.08]">
                {(['Structural Inspector', 'Operations Lead'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRole(item)}
                    className={`py-1.5 px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      role === item
                        ? 'bg-[#B58B3B]/20 text-[#E5C77B] border border-[#B58B3B]/40 shadow-sm'
                        : 'text-[#A7A39A] hover:text-[#F5F0E5] border border-transparent'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-sm font-medium text-[#F5F0E5] transition-all cursor-pointer"
            >
              Sign In as Operator
            </button>
          </form>

          <div className="relative my-5 flex items-center justify-center">
            <div className="w-full border-t border-white/[0.08]" />
            <span className="bg-[#121212] px-3 text-[10px] font-mono uppercase tracking-widest text-[#7C7870]">
              or instant showcase
            </span>
          </div>

          <button
            type="button"
            onClick={() => onEnterWorkspace({ email: 'demo@archonix.io', role })}
            className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#E5C77B] to-[#C9A24B] hover:from-[#F0D58D] hover:to-[#D5AE56] active:scale-[0.99] text-[#090909] font-semibold text-sm flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(229,199,123,0.22)] transition-all cursor-pointer"
          >
            <Zap className="h-4 w-4 fill-[#090909]" />
            Enter Demo Workspace
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-3 text-center text-[11px] font-mono text-[#7C7870]">
            Browser-local demo workspace • Zero credentials required
          </p>
        </div>
      </div>
    </div>
  );
};
