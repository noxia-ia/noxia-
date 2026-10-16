"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const INTRO_KEY = "noxia-intro-seen";

export function NoxiaIntro() {
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);

    if (sessionStorage.getItem(INTRO_KEY) === "1" || media.matches) {
      setVisible(false);
      return;
    }

    const timers = [
      window.setTimeout(() => setPhase(1), 650),
      window.setTimeout(() => setPhase(2), 1500),
      window.setTimeout(() => setPhase(3), 2400),
      window.setTimeout(() => finish(), 4000),
    ];

    return () => timers.forEach(window.clearTimeout);
  }, []);

  function finish() {
    sessionStorage.setItem(INTRO_KEY, "1");
    setVisible(false);
  }

  if (!visible || reducedMotion) return null;

  return (
    <div className="noxia-intro" role="dialog" aria-label="Introduction de NOXIA" aria-modal="true">
      <div className="noxia-intro__backdrop" />
      <div className="noxia-intro__orbit noxia-intro__orbit--one" />
      <div className="noxia-intro__orbit noxia-intro__orbit--two" />
      <div className="noxia-intro__core" aria-hidden="true" />

      <div className="noxia-intro__content">
        <div className="noxia-intro__logo-wrap">
          <Image
            src="/brand/noxia-logo-concept.png"
            alt="NOXIA AI"
            width={720}
            height={480}
            priority
            className="noxia-intro__logo"
          />
        </div>

        <div className="noxia-intro__copy" aria-live="polite">
          <p className={`noxia-intro__line ${phase >= 1 ? "is-visible" : ""}`}>
            Je suis <strong>NOXIA</strong>.
          </p>
          <p className={`noxia-intro__line ${phase >= 2 ? "is-visible" : ""}`}>
            Je peux t&apos;écouter, réfléchir, créer et avancer avec toi.
          </p>
          <p className={`noxia-intro__line noxia-intro__line--accent ${phase >= 3 ? "is-visible" : ""}`}>
            Imagine. Crée. Innove.
          </p>
        </div>

        <button type="button" onClick={finish} className="noxia-intro__skip">
          Passer l&apos;introduction
        </button>
      </div>
    </div>
  );
}
