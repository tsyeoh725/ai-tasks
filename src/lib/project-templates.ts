// Built-in project templates shown in the "Create Project" dialog.
// The PR that introduced these references didn't ship the data file —
// stubbing with a small starter set so the build passes and users still
// see useful defaults. Add more entries as needed.

export type ProjectTemplate = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
};

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  {
    slug: "blank",
    name: "Blank project",
    description: "Start from scratch with no preset structure.",
    icon: "📁",
    color: "#6366f1",
    category: "general",
  },
  {
    slug: "marketing-campaign",
    name: "Marketing campaign",
    description: "Plan, launch, and report on a campaign.",
    icon: "📣",
    color: "#ec4899",
    category: "marketing",
  },
  {
    slug: "client-onboarding",
    name: "Client onboarding",
    description: "Standard intake checklist for a new client.",
    icon: "🤝",
    color: "#10b981",
    category: "client",
  },
  {
    slug: "product-launch",
    name: "Product launch",
    description: "Coordinate cross-functional work toward a release.",
    icon: "🚀",
    color: "#f59e0b",
    category: "product",
  },
];
