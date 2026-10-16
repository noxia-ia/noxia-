import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src/app/dashboard/layout.tsx",
  "src/components/dashboard/Sidebar.tsx",
  "src/app/pricing/page.tsx",
  "src/app/admin/layout.tsx",
  "src/app/admin/analytics/page.tsx",
  "src/app/dashboard/creations/page.tsx",
  "src/app/dashboard/abonnements/page.tsx",
];

for (const rel of required) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error(`Missing responsive surface: ${rel}`);
  const text = fs.readFileSync(file, "utf8");
  if (!/(?:sm:|md:|lg:|xl:|overflow-x-auto)/.test(text)) {
    throw new Error(`No responsive utility contract detected in ${rel}`);
  }
}

const sidebar = fs.readFileSync(path.join(root, "src/components/dashboard/Sidebar.tsx"), "utf8");
if (!sidebar.includes("overflow-x-auto") || !sidebar.includes("md:overflow-visible")) throw new Error("Sidebar mobile overflow contract missing");

const admin = fs.readFileSync(path.join(root, "src/app/admin/layout.tsx"), "utf8");
if (!admin.includes("overflow-x-auto") || !admin.includes("shrink-0")) throw new Error("Admin navigation mobile contract missing");

console.log("responsive-contract: OK (mobile navigation, grids and horizontal data surfaces checked)");
