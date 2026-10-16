import fs from 'node:fs';

const action = fs.readFileSync('src/app/dashboard/settings/actions.ts', 'utf8');
const form = fs.readFileSync('src/components/settings/SettingsForms.tsx', 'utf8');
const page = fs.readFileSync('src/app/dashboard/settings/page.tsx', 'utf8');

if (!action.includes('const { supabase, user } = await session();')) throw new Error('deletion does not derive user from authenticated session');
if (!action.includes('confirmation !== "SUPPRIMER MON COMPTE"')) throw new Error('deletion lacks explicit confirmation');
if (!action.includes('admin.auth.admin.deleteUser')) throw new Error('deletion does not use server-side auth deletion');
if (!action.includes('.eq("user_id", user.id)')) throw new Error('asset cleanup is not scoped to current user');
if (!action.includes('storage.from(match[0]).remove([asset.path])')) throw new Error('owned storage assets are not removed');
if (!action.includes('storage_provider !== "supabase-storage"')) throw new Error('storage provider is not checked');
if (!form.includes('deleteAccountAction')) throw new Error('delete form is not wired');
if (!form.includes('SUPPRIMER MON COMPTE')) throw new Error('delete form does not require exact confirmation');
if (!page.includes('<DeleteAccountForm labels={labels} />')) throw new Error('delete form is not rendered in settings');
console.log('account-deletion-security: OK');
