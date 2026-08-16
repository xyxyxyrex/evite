declare module 'vanta/dist/vanta.clouds.min' {
  import type * as Three from 'three';

  interface CloudsOptions {
    el: HTMLElement | string;
    THREE: typeof Three;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    forceAnimate?: boolean;
    minHeight?: number;
    minWidth?: number;
    scale?: number;
    scaleMobile?: number;
    speed?: number;
    backgroundColor?: number;
    skyColor?: number;
    cloudColor?: number;
    cloudShadowColor?: number;
    sunColor?: number;
    sunlightColor?: number;
    sunGlareColor?: number;
  }

  interface CloudsEffect {
    destroy(): void;
  }

  export default function CLOUDS(options: CloudsOptions): CloudsEffect;
}
