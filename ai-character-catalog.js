const firstNames = {
  woman: ['Maya', 'Ari', 'Leah', 'Zoe', 'Nina', 'Amara', 'Ruby', 'Sofia', 'Talia', 'Iris', 'Naomi', 'Cleo', 'Jade', 'Mila', 'Elena', 'Lena', 'Aisha', 'Freya', 'Mina', 'Romy', 'Nora', 'Gia', 'Lila', 'Esme', 'Anya', 'Dani', 'Sage', 'Avery', 'Remi', 'Quinn', 'Skye', 'Noor'],
  man: ['Noah', 'Eli', 'Leo', 'Miles', 'Theo', 'Andre', 'Kai', 'Julian', 'Omar', 'Felix', 'Ezra', 'Caleb', 'Rafael', 'Jude', 'Amir', 'Rowan', 'Adrian', 'Drew', 'Micah', 'Sam', 'Luca', 'Nico', 'Evan', 'Isaac', 'Remy', 'Alex', 'River', 'Ash', 'Cameron', 'Jamie', 'Morgan', 'Robin'],
  nonbinary: ['Alex', 'Avery', 'River', 'Sage', 'Remi', 'Quinn', 'Ash', 'Cameron', 'Jamie', 'Morgan', 'Robin', 'Noor', 'Kit', 'Indigo', 'Rowan', 'Milan', 'Phoenix', 'Ellis', 'Arden', 'Ren', 'Sky', 'Finley', 'Onyx', 'Shiloh', 'Wren', 'Emery', 'Lane', 'Parker', 'August', 'Charlie', 'Rory', 'Dakota']
};

const lastNames = ['Bennett', 'Brooks', 'Carter', 'Chen', 'Cole', 'Diaz', 'Ellis', 'Foster', 'Garcia', 'Green', 'Hayes', 'Hill', 'Hughes', 'James', 'Kim', 'Lane', 'Lee', 'Lopez', 'Martin', 'Morgan', 'Nguyen', 'Park', 'Patel', 'Perry', 'Price', 'Reed', 'Rivera', 'Ross', 'Shah', 'Stone', 'Taylor', 'Turner', 'Walker', 'Ward', 'White', 'Wong', 'Young', 'Clarke', 'Flores', 'Adams'];
const cities = ['Brooklyn', 'Austin', 'Seattle', 'Chicago', 'Portland', 'Denver', 'Toronto', 'Atlanta', 'San Diego', 'Boston', 'Los Angeles', 'Nashville', 'Vancouver', 'Philadelphia', 'Minneapolis', 'Miami', 'Oakland', 'Phoenix', 'Montreal', 'New York'];
const archetypes = [
  { vibe: 'playful, quick-witted, and happiest around live music', values: 'humor, curiosity, and honest chemistry', tags: ['Live music', 'Coffee spots'] },
  { vibe: 'thoughtful, outdoorsy, and always planning a small adventure', values: 'consistency, nature, and meaningful conversation', tags: ['Hiking', 'Weekend trips'] },
  { vibe: 'creative, observant, and drawn to places with a story', values: 'imagination, kindness, and thoughtful details', tags: ['Art walks', 'Bookshops'] },
  { vibe: 'warm, social, and deeply enthusiastic about good food', values: 'comfort, laughter, and generous energy', tags: ['Cooking', 'Night markets'] },
  { vibe: 'calm, curious, and happiest with a good playlist nearby', values: 'patience, openness, and shared interests', tags: ['Vinyl nights', 'Podcasts'] },
  { vibe: 'ambitious, affectionate, and protective of their downtime', values: 'growth, trust, and making time for each other', tags: ['Fitness', 'Slow mornings'] },
  { vibe: 'spontaneous, kind, and always up for trying somewhere new', values: 'adventure, sincerity, and easy conversation', tags: ['Travel', 'New cafes'] },
  { vibe: 'dry-humored, attentive, and secretly a romantic', values: 'playfulness, reliability, and emotional honesty', tags: ['Indie films', 'Dessert runs'] },
  { vibe: 'grounded, expressive, and energized by close friendships', values: 'community, directness, and mutual care', tags: ['Dance classes', 'Brunch'] },
  { vibe: 'easygoing, a little nerdy, and delighted by tiny discoveries', values: 'wonder, respect, and being fully yourself', tags: ['Museums', 'Games'] }
];
const portraits = {
  woman: [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=900&q=85'
  ],
  man: [
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=85'
  ],
  nonbinary: [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85'
  ]
};

const namesPerGender = firstNames.woman.length * lastNames.length * archetypes.length * cities.length;
const totalCharacters = namesPerGender * Object.keys(firstNames).length;

function getCharacter(gender, index) {
  if (!Object.prototype.hasOwnProperty.call(firstNames, gender)) return null;
  if (!Number.isInteger(index) || index < 0 || index >= namesPerGender) return null;

  const nameCount = firstNames[gender].length;
  const lastNameIndex = index % lastNames.length;
  const archetypeIndex = Math.floor(index / lastNames.length) % archetypes.length;
  const cityIndex = Math.floor(index / (lastNames.length * archetypes.length)) % cities.length;
  const firstNameIndex = Math.floor(index / (lastNames.length * archetypes.length * cities.length)) % nameCount;
  const archetype = archetypes[archetypeIndex];
  const age = 24 + ((index * 7 + archetypeIndex) % 13);

  return {
    id: `${gender}-${index}`,
    name: `${firstNames[gender][firstNameIndex]} ${lastNames[lastNameIndex]}`,
    gender,
    image: portraits[gender][index % portraits[gender].length],
    age,
    city: cities[cityIndex],
    match: 78 + ((index * 17 + firstNameIndex * 3) % 21),
    tags: archetype.tags,
    vibe: archetype.vibe,
    personality: {
      tone: archetype.vibe,
      values: archetype.values,
      style: `A fictional AI character with a ${archetype.vibe} personality`,
      opener: `I'm ${firstNames[gender][firstNameIndex]}, and ${archetype.vibe}. What is something you never get tired of talking about?`
    }
  };
}

function parseCharacterId(characterId) {
  if (typeof characterId !== 'string') return null;
  const match = /^(woman|man|nonbinary)-(\d+)$/.exec(characterId);
  if (!match) return null;
  return getCharacter(match[1], Number(match[2]));
}

module.exports = { getCharacter, parseCharacterId, namesPerGender, totalCharacters };
