// Category-specific prompt hints for DeepSeek R1
// BINH_PHAP v1.2: Different DNA hints for different market categories
// Detects category from question text, returns specialized system prompt additions

export type MarketCategory = 'politics' | 'tech' | 'science' | 'entertainment' | 'sports' | 'geopolitics' | 'economics' | 'other';

interface CategoryRule {
  keywords: string[];
  category: MarketCategory;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    keywords: ['election', 'president', 'congress', 'senate', 'governor', 'vote', 'democrat', 'republican', 'trump', 'biden', 'legislation', 'bill pass', 'impeach', 'primary', 'nomination', 'poll'],
    category: 'politics',
  },
  {
    keywords: ['war', 'military', 'nato', 'invasion', 'ceasefire', 'sanction', 'treaty', 'nuclear', 'missile', 'ukraine', 'russia', 'china', 'taiwan', 'iran', 'israel', 'gaza', 'un security'],
    category: 'geopolitics',
  },
  {
    keywords: ['ai ', 'artificial intelligence', 'gpt', 'llm', 'openai', 'google', 'apple', 'microsoft', 'tesla', 'spacex', 'launch', 'rocket', 'satellite', 'chip', 'semiconductor', 'quantum', 'robot'],
    category: 'tech',
  },
  {
    keywords: ['study', 'research', 'fda', 'vaccine', 'clinical trial', 'discovery', 'experiment', 'peer review', 'publish', 'nobel', 'physics', 'biology', 'chemistry', 'astronomy', 'climate'],
    category: 'science',
  },
  {
    keywords: ['oscar', 'emmy', 'grammy', 'box office', 'movie', 'film', 'album', 'song', 'celebrity', 'netflix', 'disney', 'concert', 'tour', 'award', 'billboard', 'streaming', 'release'],
    category: 'entertainment',
  },
  {
    keywords: ['win', 'championship', 'world cup', 'super bowl', 'nba', 'nfl', 'mlb', 'premier league', 'olympics', 'finals', 'playoff', 'match', 'tournament', 'ufc', 'fight'],
    category: 'sports',
  },
  {
    keywords: ['gdp', 'inflation', 'fed', 'interest rate', 'recession', 'unemployment', 'trade deficit', 'tariff', 'central bank', 'imf', 'world bank'],
    category: 'economics',
  },
];

const CATEGORY_HINTS: Record<MarketCategory, string> = {
  politics: [
    'For political events: consider polling averages, historical precedent for similar offices/legislation.',
    'Base rate: How often do incumbents win? How often do bills of this type pass?',
    'Watch for recency bias — one poll is noise, aggregates are signal.',
  ].join(' '),

  geopolitics: [
    'For geopolitical events: consider historical conflict durations, treaty success rates.',
    'Base rate: How often do ceasefire agreements hold? How often do sanctions change behavior?',
    'Avoid narrative-driven predictions — focus on structural factors and precedent.',
  ].join(' '),

  tech: [
    'For tech milestones: consider historical timelines for similar achievements.',
    'Base rate: How often are announced launch dates met? How often do AI benchmarks get beaten on schedule?',
    'Tech companies often announce optimistic timelines — adjust for delay base rate.',
  ].join(' '),

  science: [
    'For scientific events: consider publication and approval timelines.',
    'Base rate: FDA approval rate for similar drugs/treatments? Replication rate of initial findings?',
    'Scientific processes have well-documented base rates — use them.',
  ].join(' '),

  entertainment: [
    'For entertainment events: consider industry patterns and historical award distributions.',
    'Base rate: How often does the frontrunner win? How often do sequels outperform?',
    'Celebrity markets are often overpriced due to availability bias — be skeptical of hype.',
  ].join(' '),

  sports: [
    'For sports events: consider team/player historical performance in similar situations.',
    'Base rate: Home win rate, seed performance in tournaments, head-to-head records.',
    'Sports outcomes have excellent base rate data — prioritize statistics over narrative.',
  ].join(' '),

  economics: [
    'For economic events: consider historical indicator patterns and central bank behavior.',
    'Base rate: How often does the Fed cut/raise in similar conditions? GDP revision frequency?',
    'Economic predictions are notoriously hard — be conservative and calibrated.',
  ].join(' '),

  other: [
    'For this event: carefully identify the closest reference class of similar past events.',
    'Start with the broadest applicable base rate, then narrow.',
  ].join(' '),
};

/**
 * Detect market category from question text.
 * Returns the category with the most keyword matches.
 */
export function detectCategory(question: string): MarketCategory {
  const lower = question.toLowerCase();
  let bestCategory: MarketCategory = 'other';
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    const score = rule.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  return bestCategory;
}

/**
 * Get category-specific prompt hint to append to system prompt.
 */
export function getCategoryHint(question: string): string {
  const category = detectCategory(question);
  return CATEGORY_HINTS[category];
}

/**
 * Get full category info for logging.
 */
export function getCategoryInfo(question: string): { category: MarketCategory; hint: string } {
  const category = detectCategory(question);
  return { category, hint: CATEGORY_HINTS[category] };
}
