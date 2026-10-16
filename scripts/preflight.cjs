#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const required = ["package.json", "next.config.mjs", "supabase", "src"];
for (const item of required) {
  if (!fs.existsSync(path.join(process.cwd(), item))) {
    console.error(`Missing required project item: ${item}`);
    process.exit(1);
  }
}

const forbidden = [".env.local", ".env.production", ".env.development"];
const found = forbidden.filter((f) => fs.existsSync(path.join(process.cwd(), f)));
if (found.length) {
  console.error(`Refusing preflight: secret-bearing files found: ${found.join(", ")}`);
  process.exit(1);
}

console.log("NOXIA deployment preflight: PASS");
