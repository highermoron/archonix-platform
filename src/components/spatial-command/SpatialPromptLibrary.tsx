import { Building2, MapPin, Radio, Search, ShieldAlert, Sparkles, Star } from 'lucide-react';
import type { PromptCategoryId, SpatialPrompt, SpatialPromptCategory } from '../../lib/spatialPromptLibrary';

interface SpatialPromptLibraryProps {
  categories: SpatialPromptCategory[];
  highlightIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (prompt: SpatialPrompt) => void;
  search: string;
  onSearchChange: (value: string) => void;
  totalPrompts: number;
}

const CATEGORY_ICONS: Record<PromptCategoryId, typeof Sparkles> = {
  demo: Sparkles,
  proximity: MapPin,
  defects: ShieldAlert,
  telemetry: Radio,
  portfolio: Building2
};

export default function SpatialPromptLibrary({
  categories,
  highlightIndex,
  onHighlight,
  onSelect,
  search,
  onSearchChange,
  totalPrompts
}: SpatialPromptLibraryProps) {
  let runningIndex = -1;

  return (
    <div className="border-t border-[#2a2a2a] bg-[#0c0c0c]/98 rounded-b-lg">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-[#A7A39A]">
          <Sparkles className="w-3 h-3 text-[#B58B3B]" />
          <span>Prompt library</span>
          <span className="px-1.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-[#E5C77B]">
            {totalPrompts}
          </span>
        </div>
        <label className="relative flex-1 sm:max-w-xs sm:ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#777777]" />
          <input
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Filter prompts"
            aria-label="Filter spatial prompts"
            className="w-full pl-7 pr-2 py-1.5 bg-[#141414] border border-[#262626] focus:border-[#B58B3B]/60 rounded text-[11px] text-[#F5F0E5] placeholder-[#666666] outline-none"
          />
        </label>
      </div>

      <div className="max-h-[46vh] overflow-y-auto divide-y divide-[#1a1a1a]">
        {categories.length === 0 && (
          <p className="px-3 py-4 text-[11px] text-[#A7A39A]">No prompt matches that filter.</p>
        )}

        {categories.map(category => {
          const Icon = CATEGORY_ICONS[category.id];
          return (
            <section key={category.id} className="px-3 py-2.5">
              <header className="flex items-start gap-2 mb-2">
                <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#B58B3B]" />
                <div className="min-w-0">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#F5F0E5]">
                    {category.title}
                  </h3>
                  <p className="text-[10px] text-[#77736B] leading-snug">{category.subtitle}</p>
                </div>
              </header>

              <ul className="space-y-1">
                {category.prompts.map(prompt => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const isHighlighted = index === highlightIndex;
                  return (
                    <li key={prompt.id}>
                      <button
                        type="button"
                        onMouseEnter={() => onHighlight(index)}
                        onClick={() => onSelect(prompt)}
                        aria-current={isHighlighted ? 'true' : undefined}
                        className={`w-full text-left px-2.5 py-2 rounded border transition-colors cursor-pointer ${
                          isHighlighted
                            ? 'bg-[#B58B3B]/15 border-[#B58B3B]/60'
                            : 'bg-[#141414] border-[#232323] hover:border-[#B58B3B]/40 hover:bg-[#181818]'
                        }`}
                      >
                        <span className="flex items-start gap-2">
                          <span className="text-[11px] leading-snug text-[#F5F0E5] flex-1">{prompt.text}</span>
                          {prompt.demoHighlight && (
                            <span className="shrink-0 mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#B58B3B]/20 border border-[#B58B3B]/40 text-[9px] font-mono text-[#E5C77B]">
                              <Star className="w-2.5 h-2.5" />
                              DEMO
                            </span>
                          )}
                        </span>
                        <span className="block mt-1 text-[10px] text-[#8d897f] leading-snug">{prompt.outcome}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="px-3 py-1.5 border-t border-[#1e1e1e] flex items-center justify-between text-[10px] font-mono text-[#666666]">
        <span>Arrow keys to browse · Enter to run · Esc to close</span>
        <span>Ctrl / Cmd + K</span>
      </div>
    </div>
  );
}
