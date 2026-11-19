import { useEffect } from 'react';

const LERP = 0.12;

function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface EffectHandle {
  cleanup: () => void;
}

function createHalftone(eased: { x: number; y: number }): EffectHandle {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:5;';

  const coarse = document.createElement('div');
  coarse.style.cssText =
    'position:absolute;inset:0;' +
    'background-image:radial-gradient(circle, #D9480F 2px, transparent 2.6px);' +
    'background-size:14px 14px;' +
    'background-position:0 0;' +
    'opacity:0.28;' +
    '-webkit-mask-image:radial-gradient(circle 380px at ' + eased.x + 'px ' + eased.y + 'px, #000 0%, transparent 70%);' +
    'mask-image:radial-gradient(circle 380px at ' + eased.x + 'px ' + eased.y + 'px, #000 0%, transparent 70%);';

  const fine = document.createElement('div');
  fine.style.cssText =
    'position:absolute;inset:0;' +
    'background-image:radial-gradient(circle, #F4A261 1.1px, transparent 1.2px);' +
    'background-size:8px 8px;' +
    'background-position:0 0;' +
    'opacity:0.5;' +
    '-webkit-mask-image:radial-gradient(circle 150px at ' + eased.x + 'px ' + eased.y + 'px, #000 0%, transparent 75%);' +
    'mask-image:radial-gradient(circle 150px at ' + eased.x + 'px ' + eased.y + 'px, #000 0%, transparent 75%);';

  wrapper.appendChild(coarse);
  wrapper.appendChild(fine);
  document.body.appendChild(wrapper);

  let raf = 0;
  const tick = () => {
    const x = eased.x;
    const y = eased.y;
    const coarseMask = `radial-gradient(circle 380px at ${x}px ${y}px, #000 0%, transparent 70%)`;
    const fineMask = `radial-gradient(circle 150px at ${x}px ${y}px, #000 0%, transparent 75%)`;
    coarse.style.webkitMaskImage = coarseMask;
    coarse.style.maskImage = coarseMask;
    fine.style.webkitMaskImage = fineMask;
    fine.style.maskImage = fineMask;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    cleanup: () => {
      cancelAnimationFrame(raf);
      wrapper.remove();
    },
  };
}

export function CursorFx() {
  useEffect(() => {
    if (isTouchDevice() || prefersReducedMotion()) return;

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const eased = { x: pointer.x, y: pointer.y };
    let raf = 0;
    let handle: EffectHandle | null = createHalftone(eased);

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    };
    const loop = () => {
      eased.x += (pointer.x - eased.x) * LERP;
      eased.y += (pointer.y - eased.y) * LERP;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (handle) handle.cleanup();
      handle = null;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
