export interface GuestInfo {
  rawName: string;
  slug: string;
  role: '18 Roses' | '18 Candles' | '18 Treasures' | '18 Blue Bills' | 'Honored Guest';
  title: string;
  badge: string;
  description: string;
  subtitle: string;
  iconSvg: string;
}

export const GUESTS_DATA: Record<string, Array<string>> = {
  "18 Roses": [
    "Helmar Returan",
    "Lenmar Returan",
    "Martin Returan Jr.",
    "Julius Salazar",
    "Gabriel Cainglet",
    "Romar Returan",
    "Charles Emmanuel Soloriano",
    "Kyle Urbanozo",
    "Wacky Loumar Solomon",
    "Sandy Carl Templo",
    "Philip Abdon",
    "Kelly Abdon",
    "Jeros Andre Salazar",
    "Andrew Trovillas",
    "Leo Trovillas",
    "Loccio Miguel Trovillas",
    "Jemar Gabriel Trovillas",
    "Jerry Trovillas"
  ],
  "18 Candles": [
    "Sharon Templo",
    "Sol Maigue",
    "Ma. Carmen Regala",
    "Nariza B. Zayco",
    "Mary Mar Returan",
    "Lara Española",
    "Cris Joy Sencil",
    "Ghian Reign Siason",
    "Zendy Shar Templo",
    "Stiffany Dyann Templo",
    "Ashleigh Gwyneth Rodriguez",
    "Kenichi Metchell Gaudia",
    "Alyzza Faith Mojana",
    "Luxlyn Lei Badajos",
    "Johnezza Veronic Tolentino",
    "Marvi Aiah Solomon",
    "Nicole Grace Recaido",
    "Jamila Kate Degala"
  ],
  "18 Treasures": [
    "Michelle Dela Paz",
    "Ma. Roxanne Eniceno",
    "Judelyn Solidarios",
    "Dabe Maravilla",
    "Suelin Villanueva",
    "Reynalyn Estoquia",
    "Kate Andrea Salazar",
    "Diana Elizabeth Elarmo",
    "Rona Returan",
    "Arlene Trovillas",
    "Diosa Trovillas",
    "Melmia Cyann Noguid",
    "Bing Campo",
    "Anabrenda Gierza",
    "Evelyn Gerongani",
    "Danilo Bacolod",
    "JV Esoy",
    "Lee Villaflor"
  ],
  "18 Blue Bills": [
    "Roselle Returan",
    "Angel Baluran",
    "Aurelio Baluran Jr.",
    "Noel Mospa",
    "Andrew Gallego",
    "Leo Gallego",
    "Lenev Sorrosa",
    "Ma. Socorro Veloso",
    "Josephine Angolo",
    "Freda Recaido",
    "Lou Martha Solomon",
    "Jennifer Gallego",
    "Jessa Gallego",
    "Cherry Mae Millan",
    "Marjolan Returan",
    "Amalia Dioman",
    "Brenda Talaman",
    "Terrence Granada"
  ]
};

// Hyphenated slug e.g. "Lenev Sorrosa" -> "lenev-sorrosa"
export function toHyphenatedSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "") // keep letters, numbers, spaces, hyphens
    .trim()
    .replace(/[\s_]+/g, "-");
}

// Compact slug e.g. "Lenev Sorrosa" -> "lenevsorrosa"
export function toCompactSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function getGuestRouteAliases(name: string): string[] {
  const candidates = [toHyphenatedSlug(name), toCompactSlug(name)];
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = candidate.toLowerCase();
    if (!candidate || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatCustomName(slug: string): string {
  const spaced = slug
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .trim();
  
  return spaced.split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function isFuzzyMatch(str1: string, str2: string): boolean {
  if (Math.abs(str1.length - str2.length) > 2) return false;
  let diff = 0;
  let i = 0;
  let j = 0;
  while (i < str1.length && j < str2.length) {
    if (str1[i] !== str2[j]) {
      diff++;
      if (diff > 2) return false;
      if (str1.length > str2.length) i++;
      else if (str2.length > str1.length) j++;
      else { i++; j++; }
    } else {
      i++;
      j++;
    }
  }
  diff += (str1.length - i) + (str2.length - j);
  return diff <= 2;
}

export function getGuestInfo(guestParam?: string): GuestInfo {
  if (!guestParam || guestParam.trim() === '' || guestParam === 'index' || guestParam === 'John Doe') {
    return createGuestInfo("Honored Guest", "Honored Guest");
  }

  const compactInput = toCompactSlug(guestParam);

  // 1. Search exact compact match in GUESTS_DATA
  for (const [role, names] of Object.entries(GUESTS_DATA)) {
    for (const name of names) {
      if (toCompactSlug(name) === compactInput) {
        return createGuestInfo(name, role as any);
      }
    }
  }

  // 2. Search fuzzy typo match (e.g. helnar-returan -> Helmar Returan)
  for (const [role, names] of Object.entries(GUESTS_DATA)) {
    for (const name of names) {
      if (isFuzzyMatch(toCompactSlug(name), compactInput)) {
        return createGuestInfo(name, role as any);
      }
    }
  }

  // 3. Fallback for custom names in URL like /helnar-returan
  const formattedName = formatCustomName(guestParam);
  return createGuestInfo(formattedName, "Honored Guest");
}

function createGuestInfo(name: string, role: '18 Roses' | '18 Candles' | '18 Treasures' | '18 Blue Bills' | 'Honored Guest'): GuestInfo {
  const slug = toHyphenatedSlug(name);

  switch (role) {
    case '18 Roses':
      return {
        rawName: name,
        slug,
        role,
        title: "18th Birthday Debut",
        badge: "✦ 18 ROSES ENTOURAGE ✦",
        description: "You are cordially invited to grace the ballroom floor as one of my 18 Roses for a memorable grand waltz under the starlight.",
        subtitle: "A dance of honor, elegance, and unforgettable memories.",
        iconSvg: `<path d="M12 2C9 2 7 4 7 7c0 4 5 9 5 9s5-5 5-9c0-3-2-5-5-5z M12 22s-2-2-4-4 M12 22s2-2 4-4" stroke="currentColor" stroke-width="1.8" fill="none"/>`
      };
    case '18 Candles':
      return {
        rawName: name,
        slug,
        role,
        title: "18th Birthday Debut",
        badge: "✦ 18 CANDLES ENTOURAGE ✦",
        description: "You are cordially invited as one of my 18 Candles to light the path ahead and share your warmest wishes & guiding words.",
        subtitle: "A flame of love, light, and lifelong friendship.",
        iconSvg: `<path d="M12 2v4M12 10v12M8 22h8M10 6a2 2 0 0 1 4 0c0 2-2 4-2 4s-2-2-2-4z" stroke="currentColor" stroke-width="1.8" fill="none"/>`
      };
    case '18 Treasures':
      return {
        rawName: name,
        slug,
        role,
        title: "18th Birthday Debut",
        badge: "✦ 18 TREASURES ENTOURAGE ✦",
        description: "You are cordially invited as one of my 18 Treasures to share words of wisdom, symbolic gifts, and heartfelt blessings.",
        subtitle: "A gift of wisdom, love, and cherished support.",
        iconSvg: `<path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7M4 12V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M12 5v16" stroke="currentColor" stroke-width="1.8" fill="none"/>`
      };
    case '18 Blue Bills':
      return {
        rawName: name,
        slug,
        role,
        title: "18th Birthday Debut",
        badge: "✦ 18 BLUE BILLS ENTOURAGE ✦",
        description: "You are cordially invited as one of my 18 Blue Bills to present a toast of prosperity, good fortune, and bright beginnings.",
        subtitle: "A wish of prosperity, luck, and lifelong success.",
        iconSvg: `<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>`
      };
    default:
      return {
        rawName: name,
        slug,
        role: "Honored Guest",
        title: "18th Birthday Debut",
        badge: "✦ HONORED GUEST ✦",
        description: "You are cordially invited to celebrate my 18th Birthday Debut with us!",
        subtitle: "Join us for an unforgettable evening of starlight, elegance, and celebration.",
        iconSvg: `<path d="M12 2L15 8.5L22 9.2L17 14L18.5 21L12 17.5L5.5 21L7 14L2 9.2L9 8.5L12 2Z" stroke="currentColor" stroke-width="1.8" fill="none"/>`
      };
  }
}
