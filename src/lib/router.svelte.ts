// Hash routes, so the browser's back button works and any screen can be bookmarked.
//   #/            home
//   #/play/<id>   a run in a theme
//   #/theme/<id>  theme detail
//   #/summary     the last run
//   #/search      find or build a theme
//   #/settings    reading aids and options

export type Route =
  | { name: 'home' }
  | { name: 'play'; theme: string }
  | { name: 'theme'; theme: string }
  | { name: 'summary' }
  | { name: 'search' }
  | { name: 'settings' };

function parse(hash: string): Route {
  const [, name, arg] = hash.replace(/^#/, '').split('/');
  const id = arg ? decodeURIComponent(arg) : '';
  if (name === 'play' && id) return { name: 'play', theme: id };
  if (name === 'theme' && id) return { name: 'theme', theme: id };
  if (name === 'summary') return { name: 'summary' };
  if (name === 'search') return { name: 'search' };
  if (name === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

export const router = $state({ route: parse(location.hash) });

window.addEventListener('hashchange', () => {
  router.route = parse(location.hash);
  window.scrollTo(0, 0);
});

export const href = {
  home: () => '#/',
  play: (t: string) => `#/play/${encodeURIComponent(t)}`,
  theme: (t: string) => `#/theme/${encodeURIComponent(t)}`,
  summary: () => '#/summary',
  search: () => '#/search',
  settings: () => '#/settings',
};

export const go = (h: string) => {
  location.hash = h;
};

/** Replaces the current history entry, so Back skips it (used when a run ends). */
export const replace = (h: string) => {
  history.replaceState(null, '', h);
  router.route = parse(h);
};
