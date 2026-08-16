import type { ISourceOptions } from "@tsparticles/engine";

export const starParticlesConfig = {
  colors: ["#fffdf0", "#fbf3cb", "#f6e597", "#eece5a"],
  count: {
    mobile: 42,
    desktop: 96,
  },
  speed: {
    mobile: 0.22,
    desktop: 0.32,
  },
  createOptions({
    mobile,
    reducedMotion,
  }: {
    mobile: boolean;
    reducedMotion: boolean;
  }): ISourceOptions {
    const count = mobile ? this.count.mobile : this.count.desktop;
    const speed = mobile ? this.speed.mobile : this.speed.desktop;

    return {
      fullScreen: { enable: false },
      background: { color: "transparent" },
      fpsLimit: 30,
      pauseOnBlur: true,
      pauseOnOutsideViewport: true,
      detectRetina: false,
      interactivity: {
        events: {
          onClick: { enable: false },
          onHover: { enable: false },
          resize: { enable: true },
        },
      },
      particles: {
        color: { value: this.colors },
        links: { enable: false },
        move: {
          enable: !reducedMotion,
          speed,
          direction: "none",
          random: true,
          straight: false,
          outModes: { default: "out" },
        },
        number: {
          value: reducedMotion ? Math.ceil(count * 0.65) : count,
          density: { enable: true },
        },
        opacity: {
          value: reducedMotion ? 0.52 : { min: 0.48, max: 1 },
          animation: {
            enable: !reducedMotion,
            speed: 0.38,
            sync: false,
            startValue: "random",
          },
        },
        shape: {
          type: ["circle", "star"],
        },
        size: {
          value: { min: 1.35, max: 4.2 },
          animation: { enable: false },
        },
      },
    };
  },
};
