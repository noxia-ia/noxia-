import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
// ?ref=CODE : lien de parrainage (code pré-rempli). Le code est revalidé côté serveur et en base ; un code inconnu est simplement ignoré.
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const raw = (await searchParams).ref;
  const ref = (Array.isArray(raw) ? raw[0] : raw ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).toUpperCase();
  return <AuthShell title="Créer un compte"><RegisterForm initialRef={ref} /></AuthShell>;
}
