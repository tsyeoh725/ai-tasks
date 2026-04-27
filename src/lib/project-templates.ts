export type TemplateSection = { name: string; sortOrder: number };

export type ProjectTemplate = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  sections: TemplateSection[];
};

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  {
    slug: "client-onboarding",
    name: "Client Onboarding",
    description: "Structured workflow for welcoming and onboarding a new client from kickoff to go-live.",
    icon: "🤝",
    color: "#6366f1",
    category: "campaign_client",
    sections: [
      { name: "Kickoff & Discovery", sortOrder: 0 },
      { name: "Strategy & Brief", sortOrder: 1 },
      { name: "Asset Collection", sortOrder: 2 },
      { name: "Account Setup", sortOrder: 3 },
      { name: "First Deliverables", sortOrder: 4 },
      { name: "Handover & Review", sortOrder: 5 },
    ],
  },
  {
    slug: "social-media-campaign",
    name: "Social Media Campaign",
    description: "End-to-end content planning, production, approval, and publishing workflow.",
    icon: "📱",
    color: "#ec4899",
    category: "retainer_social",
    sections: [
      { name: "Content Ideation", sortOrder: 0 },
      { name: "Copywriting", sortOrder: 1 },
      { name: "Design & Creative", sortOrder: 2 },
      { name: "Client Approval", sortOrder: 3 },
      { name: "Scheduling & Publishing", sortOrder: 4 },
      { name: "Performance Review", sortOrder: 5 },
    ],
  },
  {
    slug: "seo-audit",
    name: "SEO Audit & Optimisation",
    description: "Comprehensive SEO audit with on-page, technical, and backlink tasks.",
    icon: "🔍",
    color: "#22c55e",
    category: "retainer_seo",
    sections: [
      { name: "Technical Audit", sortOrder: 0 },
      { name: "Keyword Research", sortOrder: 1 },
      { name: "On-Page Optimisation", sortOrder: 2 },
      { name: "Content Gap Analysis", sortOrder: 3 },
      { name: "Link Building", sortOrder: 4 },
      { name: "Reporting", sortOrder: 5 },
    ],
  },
  {
    slug: "ad-campaign",
    name: "Paid Ad Campaign",
    description: "Meta / Google Ads campaign from strategy to launch and optimisation.",
    icon: "📊",
    color: "#f97316",
    category: "retainer_performance",
    sections: [
      { name: "Strategy & Budget", sortOrder: 0 },
      { name: "Audience & Targeting", sortOrder: 1 },
      { name: "Creative Production", sortOrder: 2 },
      { name: "Campaign Setup", sortOrder: 3 },
      { name: "Launch & QA", sortOrder: 4 },
      { name: "Optimisation", sortOrder: 5 },
    ],
  },
  {
    slug: "ai-automation",
    name: "AI & Automation Project",
    description: "Build, test, and deploy an AI workflow or automation pipeline.",
    icon: "🤖",
    color: "#8b5cf6",
    category: "ai_automation",
    sections: [
      { name: "Requirements & Scoping", sortOrder: 0 },
      { name: "Data & Integrations", sortOrder: 1 },
      { name: "Prompt / Model Design", sortOrder: 2 },
      { name: "Build & Test", sortOrder: 3 },
      { name: "Staging Review", sortOrder: 4 },
      { name: "Production Deploy", sortOrder: 5 },
    ],
  },
  {
    slug: "internal-ops",
    name: "Internal Operations",
    description: "Track internal process improvements, team initiatives, and operational projects.",
    icon: "🏢",
    color: "#64748b",
    category: "internal",
    sections: [
      { name: "Backlog", sortOrder: 0 },
      { name: "Planning", sortOrder: 1 },
      { name: "In Progress", sortOrder: 2 },
      { name: "Review", sortOrder: 3 },
      { name: "Done", sortOrder: 4 },
    ],
  },
];

export function getBuiltinTemplate(slug: string): ProjectTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.slug === slug);
}
