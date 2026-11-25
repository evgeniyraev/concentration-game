export const FACE_IDS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 9, 10]);

export function shuffle(items, random = Math.random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

export function createDeck(random = Math.random) {
  return {
    faces: shuffle([...FACE_IDS, ...FACE_IDS], random),
    backs: shuffle([...Array(FACE_IDS.length * 2).keys()], random)
  };
}

export function remainingSeconds(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function formatSeconds(seconds) {
  return [Math.floor(seconds / 60), seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
