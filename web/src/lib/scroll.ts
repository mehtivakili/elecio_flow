import { useEffect, useState } from 'react';

/**
 * "Is the user reading down the page?" for the phone chrome (collapsing sub-tab
 * bar, folding FAB). Built to be calm rather than twitchy:
 *  - reads scroll once per animation frame;
 *  - needs a sustained 32px move in one direction before flipping;
 *  - after a flip it ignores scroll for the length of the CSS transition, so the
 *    layout shift the flip itself causes can't flip it straight back;
 *  - stays off on short pages (little room to scroll) and near the top;
 *  - ignores the bounce at the very bottom of the page.
 */
export function useScrollingDown(enabled: boolean, resetKey?: unknown, { minRoom = 280, minScroll = 120 } = {}) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    setDown(false);
    const main = document.getElementById('app-main');
    if (!main || !enabled) return;
    let last = main.scrollTop;
    let travel = 0;
    let state = false;
    let lockUntil = 0;
    let frame = 0;
    const flip = (next: boolean) => {
      state = next;
      travel = 0;
      lockUntil = performance.now() + 380;
      setDown(next);
    };
    const read = () => {
      frame = 0;
      const y = main.scrollTop;
      const delta = y - last;
      last = y;
      if (performance.now() < lockUntil) { travel = 0; return; }
      const room = main.scrollHeight - main.clientHeight;
      // Folding the header itself takes ~50px of room away, so once folded the page
      // must get clearly shorter before we unfold — otherwise it would flip-flop.
      if (y < minScroll || room < (state ? minRoom - 120 : minRoom)) {
        if (state) flip(false);
        travel = 0;
        return;
      }
      if (delta < 0 && y + main.clientHeight >= main.scrollHeight - 4) return;
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      if (!state && travel > 32) flip(true);
      else if (state && travel < -32) flip(false);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => { main.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [enabled, resetKey, minRoom, minScroll]);
  return down;
}
