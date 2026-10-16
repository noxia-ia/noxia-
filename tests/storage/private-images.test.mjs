import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/0021_private_images.sql", "utf8");
const route = fs.readFileSync("src/app/api/media/image/route.ts", "utf8");
const storage = fs.readFileSync("src/lib/storage/supabase-storage.ts", "utf8");

assert.match(migration, /update\s+storage\.buckets/i);
assert.match(migration, /public\s*=\s*false/i);
assert.match(route, /STORED_IMAGE_PATH_RE/);
assert.match(route, /createSignedUrl/);
assert.match(route, /eq\("user_id", user\.id\)/);
assert.match(storage, /\/api\/media\/\$\{mediaKind\}/);
assert.doesNotMatch(storage, /getPublicUrl\(/);
console.log("private-images tests: ok");
