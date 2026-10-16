import { AuthShell } from "@/components/auth/AuthShell";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { AGE_RESERVED } from "@/lib/safety/age";
export default function AgeRestrictedPage() {
  return (
    <AuthShell title="Accès non disponible">
      <p className="mt-3 text-noxia-ash">{AGE_RESERVED.replace("personnes", "utilisateurs")}</p>
      <div className="mt-6"><SignOutButton /></div>
    </AuthShell>
  );
}
