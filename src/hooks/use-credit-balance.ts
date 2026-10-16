import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useCreditBalance(userId: string | null, initialCredits = 0) {
  const [credits, setCredits] = useState(initialCredits);
  // Chaque composant a SON canal : la barre du haut et le contenu d'une page affichent parfois le solde en même temps,
  // et Supabase refuse un 2e abonnement sur un canal déjà ouvert (« cannot add postgres_changes callbacks after subscribe() »).
  const instance = useId();

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();

    supabase
      .from("profiles")
      .select("credits")
      .eq("user_id", userId)
      .maybeSingle<{ credits: number }>()
      .then(({ data }) => {
        if (data) setCredits(data.credits);
      });

    const channel = supabase
      .channel(`noxia-credit-balance:${userId}:${instance}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = Number((payload.new as { credits?: number }).credits);
          if (Number.isFinite(next)) setCredits(next);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, instance]);

  return credits;
}
