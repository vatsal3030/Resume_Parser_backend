/**
 * Tool Registry — Central registry of all AI tools with metadata.
 * Used for credit costing, rate limiting, and UI rendering.
 */

export const TOOL_REGISTRY = {
  PARSE_RESUME: {
    id: 'PARSE_RESUME',
    name: 'Resume Analysis',
    description: 'Deep AI evaluation with ATS scoring',
    icon: 'FileText',
    color: 'bg-brutal-yellow',
    creditCost: 2,
    rateLimit: { maxPerHour: 10, maxPerDay: 30 },
    category: 'analysis',
    isAsync: true,
  },
  TAILOR_RESUME: {
    id: 'TAILOR_RESUME',
    name: 'Resume Tailoring',
    description: 'Optimize resume for a specific JD',
    icon: 'Target',
    color: 'bg-brutal-blue',
    creditCost: 3,
    rateLimit: { maxPerHour: 8, maxPerDay: 25 },
    category: 'generation',
    isAsync: true,
  },
  GENERATE_COVER_LETTER: {
    id: 'GENERATE_COVER_LETTER',
    name: 'Cover Letter',
    description: 'Generate personalized cover letters',
    icon: 'MessageSquare',
    color: 'bg-brutal-pink',
    creditCost: 2,
    rateLimit: { maxPerHour: 10, maxPerDay: 30 },
    category: 'generation',
    isAsync: true,
  },
  GENERATE_MOCK_INTERVIEW: {
    id: 'GENERATE_MOCK_INTERVIEW',
    name: 'Mock Interview',
    description: 'AI-generated interview questions',
    icon: 'Briefcase',
    color: 'bg-brutal-mint',
    creditCost: 3,
    rateLimit: { maxPerHour: 6, maxPerDay: 20 },
    category: 'generation',
    isAsync: true,
  },
  GENERATE_ROADMAP: {
    id: 'GENERATE_ROADMAP',
    name: 'Career Roadmap',
    description: 'Skill-gap analysis and learning path',
    icon: 'Map',
    color: 'bg-purple-300',
    creditCost: 3,
    rateLimit: { maxPerHour: 5, maxPerDay: 15 },
    category: 'generation',
    isAsync: true,
  },
  GENERATE_PORTFOLIO: {
    id: 'GENERATE_PORTFOLIO',
    name: 'Portfolio Generator',
    description: 'Generate portfolio from resume',
    icon: 'Layout',
    color: 'bg-orange-300',
    creditCost: 4,
    rateLimit: { maxPerHour: 4, maxPerDay: 10 },
    category: 'generation',
    isAsync: true,
  },
  ANALYZE_GITHUB: {
    id: 'ANALYZE_GITHUB',
    name: 'GitHub Analysis',
    description: 'Analyze GitHub profile and repos',
    icon: 'Code2',
    color: 'bg-gray-300',
    creditCost: 3,
    rateLimit: { maxPerHour: 50, maxPerDay: 150 },
    category: 'analysis',
    isAsync: true,
  },
  REWRITE_BULLET: {
    id: 'REWRITE_BULLET',
    name: 'Bullet Rewrite',
    description: 'Enhance or quantify bullet points',
    icon: 'Sparkles',
    color: 'bg-brutal-yellow',
    creditCost: 1,
    rateLimit: { maxPerHour: 30, maxPerDay: 100 },
    category: 'micro',
    isAsync: false,
  },
  AI_SUMMARY: {
    id: 'AI_SUMMARY',
    name: 'AI Summary',
    description: 'Generate professional summary',
    icon: 'Sparkles',
    color: 'bg-brutal-pink',
    creditCost: 1,
    rateLimit: { maxPerHour: 20, maxPerDay: 60 },
    category: 'micro',
    isAsync: false,
  },
  GENERATE_GITHUB_README: {
    id: 'GENERATE_GITHUB_README',
    name: 'GitHub README',
    description: 'Generate profile README from analysis',
    icon: 'FileText',
    color: 'bg-green-300',
    creditCost: 1,
    rateLimit: { maxPerHour: 10, maxPerDay: 30 },
    category: 'generation',
    isAsync: false,
  },
  GRADE_MOCK_INTERVIEW: {
    id: 'GRADE_MOCK_INTERVIEW',
    name: 'Interview Grading',
    description: 'Grade mock interview answers',
    icon: 'CheckCircle',
    color: 'bg-brutal-mint',
    creditCost: 2,
    rateLimit: { maxPerHour: 10, maxPerDay: 30 },
    category: 'micro',
    isAsync: false,
  },
};

/**
 * Get tool config by ID. Returns null if not found.
 */
export function getToolConfig(toolId) {
  return TOOL_REGISTRY[toolId] || null;
}

/**
 * Get all tools as an array, optionally filtered by category.
 */
export function listTools(category = null) {
  const tools = Object.values(TOOL_REGISTRY);
  return category ? tools.filter(t => t.category === category) : tools;
}

/**
 * Get credit cost for a tool. Returns 1 as default.
 */
export function getToolCreditCost(toolId) {
  return TOOL_REGISTRY[toolId]?.creditCost || 1;
}
