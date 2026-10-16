import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const routes = [
  ['image', 'src/app/api/media/image/route.ts'],
  ['video', 'src/app/api/media/video/route.ts'],
  ['audio', 'src/app/api/media/audio/route.ts'],
];

for (const [kind, rel] of routes) {
  const file = fs.readFileSync(path.join(root, rel), 'utf8');
  if (!file.includes('supabase.auth.getUser()')) throw new Error(`${kind}: missing authenticated session check`);
  if (!file.includes('eq("user_id", user.id)')) throw new Error(`${kind}: missing ownership check`);
  if (!file.includes('eq("path", path')) throw new Error(`${kind}: missing exact path ownership check`);
  if (!file.includes('createSignedUrl(')) throw new Error(`${kind}: missing short-lived signed URL`);
  if (!file.includes('createAdminClient')) throw new Error(`${kind}: expected server-side storage client`);
  if (file.includes('getPublicUrl(')) throw new Error(`${kind}: public storage URL must not be exposed`);
}

const storage = fs.readFileSync(path.join(root, 'src/lib/storage/supabase-storage.ts'), 'utf8');
if (!storage.includes('return { storedUrl: `/api/media/${mediaKind}?path=${encodeURIComponent(input.path)}` }')) {
  throw new Error('storage provider must expose only NOXIA media routes');
}

console.log('media-route-security: OK (image/video/audio authenticated and owner-scoped)');
