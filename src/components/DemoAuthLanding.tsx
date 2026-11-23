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
    <div className="min-h-screen w-full bg-[#09090b] text-zinc-100 grid grid-cols-1 lg:grid-cols-2 selection:bg-amber-400/30">
      <div className="relative flex flex-col justify-between p-8 sm:p-12 lg:p-16 border-b lg:border-b-0 lg:border-r border-zinc-800/80 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px]">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-[0_0_25px_rgba(251,191,36,0.12)]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold tracking-[0.22em] text-sm text-white">ARCHONIX</div>
            <div className="text-[11px] tracking-[0.18em] text-amber-400/90 uppercase">
              World Enterprise Telemetry
            </div>
          </div>
        </div>

        <div className="my-12 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium mb-6">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            PostGIS Live • 8 Global Capitals Seeded
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.12] text-white">
            Buildings Have a Health.
            <span className="block text-[#e5c158] mt-1">We Monitor It.</span>
          </h1>

          <p className="mt-5 text-zinc-400 text-base sm:text-lg leading-relaxed">
            A structural asset workspace for recording inspection evidence, monitoring live spatial
            telemetry, and reviewing global building history in real time.
          </p>

          <div className="mt-7">
            <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2.5">
              Active Telemetry Nodes
            </div>
            <div className="flex flex-wrap gap-2">
              {DEMO_CAPITALS.map((city) => (
                <span
                  key={city}
                  className="px-2.5 py-1 rounded-md text-xs bg-zinc-900/90 border border-zinc-800 text-zinc-300"
                >
                  {city}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-3 gap-4 pt-8 border-t border-zinc-800/80">
            <div className="flex items-start gap-2.5">
              <ClipboardCheck className="h-4 w-4 text-[#e5c158] shrink-0 mt-1" />
              <div>
                <div className="text-sm font-semibold text-[#e5c158]">Manual</div>
                <div className="text-xs text-zinc-400 mt-0.5">Inspection Records</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Globe className="h-4 w-4 text-[#e5c158] shrink-0 mt-1" />
              <div>
                <div className="text-sm font-semibold text-[#e5c158]">GIS Map</div>
                <div className="text-xs text-zinc-400 mt-0.5">Incident Pinpointing</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <FileText className="h-4 w-4 text-[#e5c158] shrink-0 mt-1" />
              <div>
                <div className="text-sm font-semibold text-[#e5c158]">PDF</div>
                <div className="text-xs text-zinc-400 mt-0.5">Print-ready Reports</div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-xs text-zinc-500">
            © 2026 ARCHONIX World Enterprise Telemetry • Global Operations
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-12 bg-[#050507] overflow-hidden">
        <div className="pointer-events-none absolute h-96 w-96 rounded-full bg-amber-400/10 blur-[120px]" />

        <div className="relative w-full max-w-md rounded-2xl bg-zinc-950/90 border border-zinc-800/90 p-7 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2 mb-5">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-400/10 border border-amber-400/30 text-[11px] font-semibold tracking-wider text-amber-300 uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Command Center Access
            </span>

            <button
              type="button"
              onClick={handleFillDemo}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-300 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Auto-fill Demo
            </button>
          </div>

          <h2 className="text-2xl font-bold text-white tracking-tight">Explore the command center</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Sign in with operator credentials or launch directly into the pre-seeded global sandbox.
          </p>

          <form onSubmit={handleOperatorSignIn} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Operator Email</label>
              <div className="relative">
                <Mail className="h-4 w-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="inspector@archonix.io"
                  className="w-full rounded-lg bg-zinc-900/90 border border-zinc-800 pl-10 pr-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Access Passkey</label>
              <div className="relative">
                <Lock className="h-4 w-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg bg-zinc-900/90 border border-zinc-800 pl-10 pr-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Session Profile</label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
                {(['Structural Inspector', 'Operations Lead'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRole(item)}
                    className={`py-1.5 px-2.5 rounded-md text-xs font-medium transition-all ${
                      role === item
                        ? 'bg-zinc-800 text-amber-300 border border-amber-400/30 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
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
              className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-sm font-medium text-zinc-100 transition-colors"
            >
              Sign In as Operator
            </button>
          </form>

          <div className="relative my-5 flex items-center justify-center">
            <div className="w-full border-t border-zinc-800" />
            <span className="bg-zinc-950 px-3 text-[11px] uppercase tracking-widest text-zinc-500">
              or instant showcase
            </span>
          </div>

          <button
            type="button"
            onClick={() => onEnterWorkspace({ email: 'demo@archonix.io', role })}
            className="w-full py-3.5 px-5 rounded-xl bg-[#e5c158] hover:bg-[#edd074] active:scale-[0.99] text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(229,193,88,0.22)] transition-all cursor-pointer"
          >
            <Zap className="h-4 w-4 fill-zinc-950" />
            Enter Demo Workspace
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-3 text-center text-[11px] text-zinc-500">
            Connected to live Neon PostGIS demo dataset • Zero credentials required
          </p>
        </div>
      </div>
    </div>
  );
};
