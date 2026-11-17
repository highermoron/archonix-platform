export type PromptCategoryId = 'demo' | 'proximity' | 'defects' | 'telemetry' | 'portfolio';

export interface SpatialPrompt {
  id: string;
  /** Sent to the spatial engine verbatim. */
  text: string;
  /** One line on what the query does to the map. */
  outcome: string;
  /** True for the prompts that work best in a live demo. */
  demoHighlight?: boolean;
}

export interface SpatialPromptCategory {
  id: PromptCategoryId;
  title: string;
  subtitle: string;
  prompts: SpatialPrompt[];
}

export const SPATIAL_PROMPT_CATEGORIES: SpatialPromptCategory[] = [
  {
    id: 'demo',
    title: 'High-impact multi-condition',
    subtitle: 'Proximity + classification + defect records in one sentence - best for demos',
    prompts: [
      {
        id: 'demo-class2-harbour-cracks',
        text: 'Show Class 2 high-rises within 15 km of Sydney Harbour with unresolved cracks',
        outcome: 'Combines a 15 km ST_DWithin buffer, Class 2 classification and open crack findings, then flies to the match.',
        demoHighlight: true
      },
      {
        id: 'demo-nsw-high-concern',
        text: 'NSW assets with active high concern or inspection recommended',
        outcome: 'Frames every NSW asset flagged for engineering follow-up and lists the recorded findings.',
        demoHighlight: true
      },
      {
        id: 'demo-commercial-health',
        text: 'Commercial towers in Sydney with Health Index under 95%',
        outcome: 'Ranks commercial assets by structural health index inside the Sydney anchor buffer.',
        demoHighlight: true
      }
    ]
  },
  {
    id: 'proximity',
    title: 'Proximity & PostGIS radius',
    subtitle: 'Landmark buffers resolved to ST_DWithin geography queries',
    prompts: [
      {
        id: 'proximity-harbour-25',
        text: 'Show all buildings within 25 km of Sydney Harbour',
        outcome: 'Pure radius search from the harbour anchor - every category, ordered by health index.'
      },
      {
        id: 'proximity-parramatta-10',
        text: 'Assets within 10 km of Parramatta',
        outcome: '10 km buffer around the Parramatta anchor, nearest assets first.'
      },
      {
        id: 'proximity-silverwater-5',
        text: 'Show monitored structures within 5 km of Silverwater',
        outcome: 'Tight industrial radius around Silverwater for monitored structures only.'
      },
      {
        id: 'proximity-cbd-20',
        text: 'Show commercial high-rises within 20 km of Sydney CBD',
        outcome: 'Commercial classification plus a 20 km CBD buffer and a high-rise height floor.'
      }
    ]
  },
  {
    id: 'defects',
    title: 'Structural defect triage',
    subtitle: 'Filters on recorded defect codes, resolution state and inspection recency',
    prompts: [
      {
        id: 'defects-shear-micro',
        text: 'Show buildings with diagonal shear cracks or micro-fissuring',
        outcome: 'Matches shear and micro-fissure defect codes only, with the crack note quoted back.'
      },
      {
        id: 'defects-moisture',
        text: 'Highlight assets with basement moisture ingress or efflorescence',
        outcome: 'Moisture and efflorescence findings, ranked by the severity of the recorded note.'
      },
      {
        id: 'defects-urgent',
        text: 'Show urgent assessment buildings needing immediate inspection',
        outcome: 'Assets in the Urgent Assessment status with their open findings attached.'
      },
      {
        id: 'defects-recent',
        text: 'Filter to buildings with structural findings from the last 6 months',
        outcome: 'Applies a date window to the recorded inspection date of every finding.'
      }
    ]
  },
  {
    id: 'telemetry',
    title: 'Live IoT telemetry alerts',
    subtitle: 'Reads the live sensor stream - run a tremor or wind preset first for maximum impact',
    prompts: [
      {
        id: 'telemetry-critical-vibration',
        text: 'Show buildings with critical IoT telemetry alerts and vibration spikes',
        outcome: 'Isolates assets whose sensors are in a critical breach, with the peak metric shown.',
        demoHighlight: true
      },
      {
        id: 'telemetry-tilt',
        text: 'Highlight structures with abnormal foundation tilt or displacement',
        outcome: 'Filters on the foundation tiltmeter at warning level or above.'
      },
      {
        id: 'telemetry-strain',
        text: 'Show buildings exceeding critical column microstrain thresholds',
        outcome: 'Filters on the column strain gauge at critical threshold.'
      }
    ]
  },
  {
    id: 'portfolio',
    title: 'Portfolio class & height',
    subtitle: 'BCA classification, asset category and storey filters',
    prompts: [
      {
        id: 'portfolio-class2-highrise',
        text: 'Show all Class 2 multi-residential high-rises',
        outcome: 'Class 2 residential assets with at least 8 storeys.'
      },
      {
        id: 'portfolio-industrial',
        text: 'Show industrial warehouses and logistics hubs',
        outcome: 'Industrial and logistics assets across the whole portfolio.'
      },
      {
        id: 'portfolio-commercial-30',
        text: 'Commercial towers with more than 30 floors',
        outcome: 'Commercial assets above 30 storeys, ordered by health index.'
      },
      {
        id: 'portfolio-institutional',
        text: 'Institutional and school campus assets',
        outcome: 'Institutional, education and campus assets.'
      }
    ]
  }
];

export const ALL_SPATIAL_PROMPTS: SpatialPrompt[] = SPATIAL_PROMPT_CATEGORIES.flatMap(
  category => category.prompts
);

export const DEFAULT_PROMPT = ALL_SPATIAL_PROMPTS[0];

/** Filters the library by free text across prompt wording and outcome copy. */
export function filterPromptCategories(search: string): SpatialPromptCategory[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return SPATIAL_PROMPT_CATEGORIES;

  return SPATIAL_PROMPT_CATEGORIES
    .map(category => ({
      ...category,
      prompts: category.prompts.filter(prompt =>
        prompt.text.toLowerCase().includes(needle)
        || prompt.outcome.toLowerCase().includes(needle)
        || category.title.toLowerCase().includes(needle)
      )
    }))
    .filter(category => category.prompts.length > 0);
}
