import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { getAgeStatus, AGE_RESERVED } from "@/lib/safety/age";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyAgeForm } from "@/components/auth/VerifyAgeForm";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

export default async function VerifyAgePage() {
  const { profile } = await getSessionProfile();
  const status = getAgeStatus(profile?.date_of_birth ?? null);
  if (status === "ok") redirect("/dashboard");
  if (status === "restricted") redirect("/age-restricted");
  return (
    <AuthShell title="Vérification de l’âge">
      <p className="mt-3 text-noxia-ash">{AGE_RESERVED}</p>
      <VerifyAgeForm />
      <div className="mt-6"><SignOutButton /></div>
    </AuthShell>
  );
}
