// The app's look: Paper (light), Night (dark) or Arcade (game board). index.html applies the
// saved one before the first paint; this keeps it in step afterwards.

import type { Look } from './storage';

export const LOOKS: { id: Look; name: string; desc: string }[] = [
  { id: 'paper', name: 'Paper', desc: 'Bright and quiet. Best in daylight.' },
  { id: 'night', name: 'Night', desc: 'Dim and low-glare, for a dark room or the late train.' },
  { id: 'arcade', name: 'Arcade', desc: 'A game board: pressable tiles, a stage bar and combos.' },
];

const THEME_COLOR: Record<Look, string> = { paper: '#ffffff', night: '#15171c', arcade: '#1e1b45' };

export const deviceLook = (): Look =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper';

export function applyLook(look: Look | null) {
  const l = look ?? deviceLook();
  document.documentElement.dataset.look = l;
  document.querySelector<HTMLMetaElement>('meta[name=theme-color]')?.setAttribute('content', THEME_COLOR[l]);
}
