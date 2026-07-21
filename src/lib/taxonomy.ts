// Fixed Strategies & Focus Areas taxonomy — Section 5.4.
// Single source of truth: the Classification Engine, the filter accordions,
// the Populate criteria picker, and server-side validation all read from here.
// Never let an LLM response bypass this list.

export const STRATEGIES_TAXONOMY: Record<string, string[]> = {
  "Real Estate Equity": [
    "Core",
    "Core-Plus",
    "Value-Add",
    "Opportunistic",
    "Development Equity",
    "Acquisition & Development",
    "Build-to-Core",
    "Platform Investments",
    "Programmatic Joint Ventures",
    "Co-Investments",
  ],
  "Real Estate Credit": [
    "Senior Debt",
    "Whole Loans",
    "Bridge Lending",
    "Construction Lending",
    "Mezzanine Debt",
    "Preferred Equity",
    "Mortgage Credit",
    "Distressed Debt",
    "Rescue Capital",
    "Special Situations",
  ],
  "Infrastructure Equity": [
    "Core Infrastructure",
    "Core-Plus Infrastructure",
    "Value-Add Infrastructure",
    "Brownfield",
    "Greenfield",
    "PPP / P3",
    "Concessions",
  ],
  "Infrastructure Debt": [
    "Senior Infrastructure Debt",
    "Junior Infrastructure Debt",
    "Project Finance",
    "Acquisition Finance",
    "Refinancing",
    "Structured Infrastructure Credit",
  ],
  "Private Credit": [
    "Direct Lending",
    "Unitranche",
    "Asset-Based Lending",
    "Specialty Finance",
    "Structured Credit",
    "Sponsor Finance",
    "Corporate Credit",
    "Growth Lending",
    "Mezzanine Lending",
    "Distressed Credit",
    "Opportunistic Credit",
  ],
  "Private Equity": [
    "Buyouts",
    "Growth Equity",
    "Expansion Capital",
    "Control Investments",
    "Minority Investments",
    "Lower Middle Market",
    "Mid-Market",
    "Large Buyouts",
    "Sector Specialists",
  ],
  "Asset Finance": [
    "Aviation Finance",
    "Aircraft Leasing",
    "Engine Leasing",
    "Equipment Finance",
    "Fleet Leasing",
    "Maritime Finance",
    "Rail Leasing",
    "Receivables Finance",
    "Trade Finance",
  ],
  "Venture Capital": ["Seed", "Early Stage", "Growth Venture", "Late Stage", "Venture Debt"],
  Secondaries: ["LP Secondaries", "GP-Led Secondaries", "Continuation Funds", "GP Preferred Equity"],
  "Real Assets": ["Timberland", "Farmland", "Water Rights", "Royalties", "Natural Resources"],
  "Hybrid / Multi-Strategy": [
    "Flexible Capital",
    "Multi-Strategy",
    "Cross-Asset",
    "Hybrid Capital",
    "Special Opportunities",
  ],
};

export const FOCUS_AREAS_TAXONOMY: Record<string, string[]> = {
  Residential: [
    "Multifamily",
    "Single Family Rental",
    "Build-to-Rent",
    "Affordable Housing",
    "Workforce Housing",
    "Student Housing",
    "Senior Housing",
    "Manufactured Housing",
    "Residential Land",
  ],
  "Commercial Real Estate": [
    "Office",
    "Industrial",
    "Logistics",
    "Retail",
    "Mixed Use",
    "Hospitality",
    "Self Storage",
    "Medical Office",
    "Healthcare Real Estate",
    "Life Sciences",
    "Cold Storage",
    "Data Centers",
  ],
  Infrastructure: [
    "Transportation",
    "Airports",
    "Ports",
    "Roads",
    "Rail",
    "Utilities",
    "Water",
    "Waste",
    "Social Infrastructure",
    "Communications Infrastructure",
  ],
  "Digital Infrastructure": ["Data Centers", "Fiber Networks", "Telecom Towers", "Edge Computing", "Small Cells"],
  Energy: [
    "Solar",
    "Wind",
    "Hydroelectric",
    "Geothermal",
    "Battery Energy Storage Systems (BESS)",
    "Grid Infrastructure",
    "Transmission",
    "Distributed Energy",
    "Microgrids",
    "EV Charging",
    "Hydrogen",
    "Renewable Natural Gas",
    "Carbon Capture",
    "Sustainable Aviation Fuel",
    "Conventional Power",
    "Oil & Gas Midstream",
  ],
  "Transportation & Mobility": [
    "Aviation",
    "Aircraft",
    "Air Cargo",
    "Freighters",
    "Airports",
    "Maritime",
    "Shipping",
    "Ports",
    "Rail",
    "Rolling Stock",
    "Fleet Assets",
  ],
  "Natural Resources": ["Timber", "Agriculture", "Mining", "Metals", "Critical Minerals", "Water", "Forestry"],
  "Financial Assets": [
    "Consumer Finance",
    "Commercial Finance",
    "Asset-Backed Finance",
    "Mortgage Finance",
    "Trade Receivables",
    "Equipment Leasing",
  ],
  Technology: [
    "Artificial Intelligence",
    "Software",
    "Cybersecurity",
    "FinTech",
    "Cloud Infrastructure",
    "Telecommunications",
    "Semiconductors",
  ],
  Healthcare: ["Healthcare Services"],
};

export type TaxonomySelection = Record<string, string[]>;

/**
 * Validates an LLM-produced {parent: [children]} object against a fixed taxonomy.
 * Drops unknown parents/children (logging them) and drops any parent left with
 * zero valid children. Never coerces to a "nearest match."
 */
export function validateTaxonomySelection(
  candidate: unknown,
  taxonomy: Record<string, string[]>
): { valid: TaxonomySelection; dropped: string[] } {
  const valid: TaxonomySelection = {};
  const dropped: string[] = [];

  if (!candidate || typeof candidate !== "object") {
    return { valid, dropped };
  }

  for (const [parent, children] of Object.entries(candidate as Record<string, unknown>)) {
    const allowedChildren = taxonomy[parent];
    if (!allowedChildren) {
      dropped.push(`${parent} (unknown parent)`);
      continue;
    }
    if (!Array.isArray(children)) {
      dropped.push(`${parent} (children not an array)`);
      continue;
    }
    const validChildren = children.filter((c): c is string => {
      const ok = typeof c === "string" && allowedChildren.includes(c);
      if (!ok) dropped.push(`${parent} → ${c}`);
      return ok;
    });
    if (validChildren.length > 0) {
      valid[parent] = Array.from(new Set(validChildren));
    }
  }

  return { valid, dropped };
}

export function taxonomyParentGroups(taxonomy: Record<string, string[]>): string[] {
  return Object.keys(taxonomy);
}
