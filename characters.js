const READ_ME_PATH = './README.md';

export const DIFFICULTIES = [
  { id: 'common', label: 'Common', rangeLabel: '1 - 140', maxIndex: 140 },
  { id: 'uncommon', label: 'Uncommon', rangeLabel: '1 - 232', maxIndex: 232 },
  { id: 'rare', label: 'Rare', rangeLabel: '1 - 380', maxIndex: 380 },
  { id: 'super-rare', label: 'Super rare', rangeLabel: '1 - 500', maxIndex: 500 },
  { id: 'unseen', label: 'Unseen', rangeLabel: '1 - 1000', maxIndex: 1000 },
];

let characterBookPromise;

function normalizeReadme(text) {
  const withoutHeadings = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  let normalized = withoutHeadings;
  while (/\d\s+\d/.test(normalized)) {
    normalized = normalized.replace(/(\d)\s+(?=\d)/g, '$1');
  }

  return normalized;
}

function extractCharacters(text) {
  const normalized = normalizeReadme(text);
  const characters = Array(1001).fill('');
  const tokenPattern = /(\d{1,4})([^\s\d])/g;
  let match;

  while ((match = tokenPattern.exec(normalized))) {
    const index = Number(match[1]);
    const character = match[2];

    if (index >= 1 && index <= 1000 && character) {
      characters[index] = character;
    }
  }

  return characters;
}

export async function loadCharacterBook() {
  if (!characterBookPromise) {
    characterBookPromise = fetch(READ_ME_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`README fetch failed with ${response.status}`);
        }

        return response.text();
      })
      .then(extractCharacters);
  }

  return characterBookPromise;
}

export function getDifficultyConfig(difficultyId) {
  return DIFFICULTIES.find((difficulty) => difficulty.id === difficultyId) ?? DIFFICULTIES[0];
}

export function buildPool(book, maxIndex) {
  return book.slice(1, maxIndex + 1).filter(Boolean);
}

export function createRandomSource() {
  if (window.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    return () => {
      window.crypto.getRandomValues(buffer);
      return buffer[0] / 0xffffffff;
    };
  }

  return () => Math.random();
}

export function createWordPicker() {
  const random = createRandomSource();

  return function pickWord(pool, recentWords = []) {
    if (!pool.length) {
      return '';
    }

    const recent = new Set(recentWords.filter(Boolean));
    const candidatePool = pool.filter((word) => !recent.has(word));
    const source = candidatePool.length ? candidatePool : pool;
    const index = Math.floor(random() * source.length);
    return source[index];
  };
}