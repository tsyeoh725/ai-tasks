"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Color palette ─────────────────────────────────────────────────────────────

export const COLOR_PALETTE = [
  // Brand
  { name: "Edge Green", hex: "#99ff33" },
  { name: "Edge Dark", hex: "#7acc29" },
  // Greens
  { name: "Emerald", hex: "#10b981" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Mint", hex: "#6ee7b7" },
  { name: "Lime", hex: "#a3e635" },
  { name: "Forest", hex: "#166534" },
  // Blues
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Cobalt", hex: "#1d4ed8" },
  { name: "Navy", hex: "#1e3a5f" },
  { name: "Cyan", hex: "#06b6d4" },
  // Purples
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Fuchsia", hex: "#d946ef" },
  { name: "Lavender", hex: "#c4b5fd" },
  // Pinks & Reds
  { name: "Rose", hex: "#f43f5e" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Red", hex: "#ef4444" },
  { name: "Crimson", hex: "#dc2626" },
  { name: "Coral", hex: "#fb7185" },
  // Oranges & Yellows
  { name: "Orange", hex: "#f97316" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Gold", hex: "#d97706" },
  { name: "Peach", hex: "#fdba74" },
  // Neutrals
  { name: "Slate", hex: "#64748b" },
  { name: "Gray", hex: "#6b7280" },
  { name: "Zinc", hex: "#71717a" },
  { name: "Stone", hex: "#78716c" },
  { name: "Charcoal", hex: "#374151" },
  { name: "Black", hex: "#111827" },
  { name: "White", hex: "#f9fafb" },
];

// ─── Icon library ───────────────────────────────────────────────────────────────

const ICON_CATEGORIES = [
  {
    label: "Work",
    icons: [
      "💼", "🗂️", "📋", "📌", "📎", "🖇️", "📊", "📈", "📉", "📝",
      "✅", "🎯", "⚡", "🔑", "🔒", "🔓", "⚙️", "🛠️", "🔧", "🔩",
      "💻", "🖥️", "📱", "⌨️", "🖱️", "🖨️", "📡", "🔌",
    ],
  },
  {
    label: "Client",
    icons: [
      "🏢", "🏦", "🏪", "🏨", "🏗️", "🏭", "🏡", "🏛️", "🏟️",
      "🤝", "👔", "👥", "👤", "🧑‍💼", "👩‍💼", "👨‍💼",
      "💰", "💵", "💳", "🪙", "💎",
    ],
  },
  {
    label: "Creative",
    icons: [
      "🎨", "🖌️", "✏️", "🖊️", "🖋️", "🎭", "🎬", "🎥", "📸",
      "🎵", "🎶", "🎸", "🎹", "🎤", "🎧", "📻", "🎙️",
      "🌟", "✨", "💫", "🌈", "🌊", "🔥", "❄️",
    ],
  },
  {
    label: "Tech",
    icons: [
      "🤖", "🧠", "💡", "🔬", "🧬", "🧪", "⚗️", "🔭",
      "🚀", "🛸", "🛰️", "⚡", "🔋", "💾", "💿", "🖱️",
      "🌐", "📡", "📶", "🔐", "🛡️", "⚛️",
    ],
  },
  {
    label: "Marketing",
    icons: [
      "📣", "📢", "📯", "🔔", "🔈", "📊", "📈", "🎯",
      "🏆", "🥇", "🎁", "🎀", "🎉", "🎊", "🎈", "🎗️",
      "👁️", "💬", "💌", "📧", "✉️", "📬",
    ],
  },
  {
    label: "Nature",
    icons: [
      "🌿", "🌱", "🌲", "🌳", "🌴", "🌵", "🎋", "🎍",
      "🌸", "🌺", "🌻", "🌹", "🌼", "💐", "🍀", "🍃",
      "🌍", "🌏", "🌎", "🏔️", "🌋", "🏖️", "🌅",
    ],
  },
  {
    label: "Objects",
    icons: [
      "📦", "📫", "🗃️", "🗄️", "📁", "📂", "🗑️", "🗒️",
      "⏰", "⏱️", "⏲️", "🕐", "📅", "🗓️", "📆",
      "🎒", "👜", "🧳", "🔑", "🗺️", "🧭",
    ],
  },
];

// ─── ColorSwatch ────────────────────────────────────────────────────────────────

function isDark(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export function ColorSwatch({
  color,
  selected,
  onClick,
  size = "md",
}: {
  color: { name: string; hex: string };
  selected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const dim = { sm: "h-5 w-5", md: "h-7 w-7", lg: "h-9 w-9" }[size];
  return (
    <button
      type="button"
      title={color.name}
      onClick={onClick}
      className={cn(
        "relative rounded-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 focus:outline-none",
        dim,
        selected ? "ring-2 ring-offset-1 ring-gray-800" : "ring-1 ring-black/10"
      )}
      style={{ backgroundColor: color.hex }}
    >
      {selected && (
        <Check
          size={size === "sm" ? 10 : size === "md" ? 12 : 14}
          className={isDark(color.hex) ? "text-white" : "text-[#0d1a00]"}
          strokeWidth={3}
        />
      )}
    </button>
  );
}

// ─── Main picker ────────────────────────────────────────────────────────────────

type IconColorPickerProps = {
  selectedIcon?: string;
  selectedColor?: string;
  onIconChange?: (icon: string) => void;
  onColorChange?: (color: string) => void;
  showIcons?: boolean;
  showColors?: boolean;
};

export function IconColorPicker({
  selectedIcon,
  selectedColor,
  onIconChange,
  onColorChange,
  showIcons = true,
  showColors = true,
}: IconColorPickerProps) {
  const [iconSearch, setIconSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(ICON_CATEGORIES[0].label);

  const activeIcons = ICON_CATEGORIES.find((c) => c.label === activeCategory)?.icons ?? [];
  const filteredIcons = iconSearch
    ? ICON_CATEGORIES.flatMap((c) =>
        c.icons.filter((i) => {
          try {
            const name = new Intl.Segmenter().segment(i);
            return [...name].some((s) => s.segment === i);
          } catch {
            return true;
          }
        })
      )
    : activeIcons;

  return (
    <div className="space-y-4">
      {/* Color picker */}
      {showColors && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2 font-medium">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PALETTE.map((color) => (
              <ColorSwatch
                key={color.hex}
                color={color}
                selected={selectedColor === color.hex}
                onClick={() => onColorChange?.(color.hex)}
                size="sm"
              />
            ))}
          </div>
        </div>
      )}

      {/* Icon picker */}
      {showIcons && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2 font-medium">Icon</p>

          {/* Category tabs */}
          <div className="flex gap-1 flex-wrap mb-2">
            {ICON_CATEGORIES.map((cat) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => { setActiveCategory(cat.label); setIconSearch(""); }}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                  activeCategory === cat.label && !iconSearch
                    ? "bg-[#99ff33] text-[#0d1a00]"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder="Type to search…"
              className="h-7 pl-7 text-xs border-gray-200"
            />
          </div>

          {/* Icon grid */}
          <div className="grid grid-cols-8 gap-1 max-h-36 overflow-y-auto">
            {/* Clear/None option */}
            <button
              type="button"
              onClick={() => onIconChange?.("")}
              className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center text-xs transition-colors hover:bg-gray-100",
                !selectedIcon ? "bg-[#99ff33]/15 ring-1 ring-[#99ff33]" : "bg-gray-50"
              )}
              title="No icon"
            >
              <span className="text-gray-400 text-[10px]">∅</span>
            </button>
            {(iconSearch ? ICON_CATEGORIES.flatMap((c) => c.icons) : filteredIcons).map((icon, i) => (
              <button
                key={`${icon}-${i}`}
                type="button"
                onClick={() => onIconChange?.(icon)}
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center text-lg transition-colors hover:bg-gray-100",
                  selectedIcon === icon ? "bg-[#99ff33]/15 ring-1 ring-[#99ff33]" : ""
                )}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compact preview ────────────────────────────────────────────────────────────

export function ProjectColorDot({
  icon,
  color,
  size = "sm",
}: {
  icon?: string | null;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const sizes = {
    xs: "h-3 w-3 text-[8px]",
    sm: "h-5 w-5 text-xs",
    md: "h-7 w-7 text-base",
    lg: "h-9 w-9 text-xl",
  };

  if (icon) {
    return (
      <span
        className={cn("flex items-center justify-center rounded-lg shrink-0", sizes[size])}
        style={{ backgroundColor: color ? `${color}22` : "#f3f4f6" }}
      >
        {icon}
      </span>
    );
  }

  return (
    <span
      className={cn("rounded-full shrink-0 block", sizes[size])}
      style={{ backgroundColor: color || "#99ff33" }}
    />
  );
}
