export function mountVideo({ createElement, createHotspot, isActive, onExit, playlist, stage }) {
  const video = createElement('video', stage);
  video.playsInline = true;
  let failed = 0;
  let index = 0;
  createHotspot('Return home', 0, 0, 1080, 1920, onExit);

  function load() {
    const item = playlist[index];
    video.muted = item.muted;
    video.src = item.url;
    video.play().catch(() => {});
  }

  function next() {
    if (!isActive()) return;
    index = (index + 1) % playlist.length;
    load();
  }

  video.addEventListener('playing', () => { failed = 0; });
  video.addEventListener('ended', next);
  video.addEventListener('error', () => {
    if (!isActive()) return;
    failed += 1;
    if (failed >= playlist.length) onExit();
    else next();
  });
  load();

  return () => {
    video.pause();
    video.removeAttribute('src');
  };
}
