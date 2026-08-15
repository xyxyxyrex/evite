export type RenderingProfile = "full" | "mobile" | "reduced";

export interface RenderingBudget {
  profile: RenderingProfile;
  starCount: number;
  starfieldFps: number;
  handwritingParticleScale: number;
  handwritingMoteLimit: number;
  handwritingCanvasDpr: number;
  confettiParticles: number;
  sceneSparkleCount: number;
  sceneSparkleFps: number;
  sceneCanvasDpr: number;
  transitionMotes: number;
}

const FULL_BUDGET: RenderingBudget = {
  profile: "full",
  starCount: 80,
  starfieldFps: 60,
  handwritingParticleScale: 1,
  handwritingMoteLimit: 4,
  handwritingCanvasDpr: 1.5,
  confettiParticles: 180,
  sceneSparkleCount: 12,
  sceneSparkleFps: 30,
  sceneCanvasDpr: 1.5,
  transitionMotes: 12,
};

const MOBILE_BUDGET: RenderingBudget = {
  profile: "mobile",
  starCount: 20,
  starfieldFps: 20,
  handwritingParticleScale: 0.4,
  handwritingMoteLimit: 2,
  handwritingCanvasDpr: 1,
  confettiParticles: 40,
  sceneSparkleCount: 6,
  sceneSparkleFps: 20,
  sceneCanvasDpr: 1,
  transitionMotes: 6,
};

const REDUCED_BUDGET: RenderingBudget = {
  profile: "reduced",
  starCount: 0,
  starfieldFps: 0,
  handwritingParticleScale: 0,
  handwritingMoteLimit: 0,
  handwritingCanvasDpr: 0,
  confettiParticles: 0,
  sceneSparkleCount: 0,
  sceneSparkleFps: 0,
  sceneCanvasDpr: 0,
  transitionMotes: 0,
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
