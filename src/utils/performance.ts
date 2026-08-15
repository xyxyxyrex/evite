export type RenderingProfile = "full" | "mobile" | "reduced";

export interface RenderingBudget {
  profile: RenderingProfile;
  starCount: number;
  starfieldFps: number;
  handwritingParticleScale: number;
  confettiParticles: number;
}

const FULL_BUDGET: RenderingBudget = {
  profile: "full",
  starCount: 80,
  starfieldFps: 60,
  handwritingParticleScale: 1,
  confettiParticles: 180,
};

const MOBILE_BUDGET: RenderingBudget = {
  profile: "mobile",
  starCount: 20,
  starfieldFps: 20,
  handwritingParticleScale: 0.4,
  confettiParticles: 40,
};

const REDUCED_BUDGET: RenderingBudget = {
  profile: "reduced",
  starCount: 0,
  starfieldFps: 0,
  handwritingParticleScale: 0,
  confettiParticles: 0,
};

export function getRenderingBudget(
  viewportWidth: number,
  reducedMotion: boolean,
): RenderingBudget {
  if (reducedMotion) return { ...REDUCED_BUDGET };
  if (!Number.isFinite(viewportWidth) || viewportWidth < 768) {
    return { ...MOBILE_BUDGET };
  }
  return { ...FULL_BUDGET };
}
