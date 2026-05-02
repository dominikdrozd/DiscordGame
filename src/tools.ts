const TMDB_BASE = 'https://api.themoviedb.org/3';

interface SearchMovieResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  overview: string;
  vote_average: number;
  popularity: number;
}

export async function searchMovie(
  title: string,
  apiKey: string,
): Promise<{ error: string } | { query: string; results: SearchMovieResult[] }> {
  if (!apiKey) return { error: 'TMDB_API_KEY nie jest ustawiony w .env' };
  const url = `${TMDB_BASE}/search/movie?api_key=${encodeURIComponent(apiKey)}&language=pl-PL&query=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (!res.ok) return { error: `TMDB ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const results = (data.results || []).slice(0, 5).map((m: any) => ({
    id: m.id,
    title: m.title,
    original_title: m.original_title,
    release_date: m.release_date,
    overview: m.overview,
    vote_average: m.vote_average,
    popularity: m.popularity,
  }));
  return { query: title, results };
}

interface CastMember {
  name: string;
  character: string;
}

export async function getMovieDetails(
  movieId: number,
  apiKey: string,
): Promise<
  | { error: string }
  | {
      formatted: string;
      id: number;
      title: string;
      original_title: string;
      release_date: string;
      runtime_min: number;
      genres: string[];
      overview: string;
      vote_average: number;
      vote_count: number;
      directors: string[];
      cast: CastMember[];
    }
> {
  if (!apiKey) return { error: 'TMDB_API_KEY nie jest ustawiony w .env' };
  const url = `${TMDB_BASE}/movie/${encodeURIComponent(movieId)}?api_key=${encodeURIComponent(apiKey)}&language=pl-PL&append_to_response=credits`;
  const res = await fetch(url);
  if (!res.ok) return { error: `TMDB ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const directors = (data.credits?.crew || [])
    .filter((c: any) => c.job === 'Director')
    .map((c: any) => c.name);
  const cast = (data.credits?.cast || [])
    .slice(0, 5)
    .map((c: any) => ({ name: c.name, character: c.character }));

  const year = data.release_date ? data.release_date.slice(0, 4) : 'rok nieznany';
  const directorStr = directors.length ? directors.join(', ') : 'reżyser nieznany';
  const castStr = cast.length ? cast.map((c: any) => c.name).join(', ') : 'obsada nieznana';
  const rating =
    typeof data.vote_average === 'number' && data.vote_count
      ? `${data.vote_average.toFixed(1)}/10 (TMDB, ${data.vote_count} głosów)`
      : 'brak oceny';
  const genres = (data.genres || []).map((g: any) => g.name).join(', ');
  const titleLine =
    data.original_title && data.original_title !== data.title
      ? `„${data.title}" (oryg. „${data.original_title}", ${year})`
      : `„${data.title}" (${year})`;

  const formatted =
    `${titleLine} — reżyseria: ${directorStr}; w obsadzie m.in. ${castStr}. ` +
    `Gatunek: ${genres || 'nieznany'}. Ocena: ${rating}. ` +
    `${data.overview || 'Brak opisu w TMDB.'}`;

  return {
    formatted,
    id: data.id,
    title: data.title,
    original_title: data.original_title,
    release_date: data.release_date,
    runtime_min: data.runtime,
    genres: (data.genres || []).map((g: any) => g.name),
    overview: data.overview,
    vote_average: data.vote_average,
    vote_count: data.vote_count,
    directors,
    cast,
  };
}

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_movie',
      description:
        'Wyszukuje film w TMDB po tytule. Zwraca listę dopasowań (id, tytuł, rok, opis, ocena). Wywołaj jako PIERWSZY krok zawsze, gdy pytanie dotyczy filmu.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Tytuł filmu (po polsku lub w oryginale).',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_movie_details',
      description:
        'Pobiera szczegóły filmu z TMDB po jego id: reżyser, najważniejsi aktorzy, ocena, rok, gatunki, czas trwania, opis. Wywołaj ZAWSZE po search_movie, żeby uzyskać reżysera i obsadę przed prezentacją filmu.',
      parameters: {
        type: 'object',
        properties: {
          movie_id: {
            type: 'integer',
            description: 'Identyfikator filmu zwrócony przez search_movie (pole id).',
          },
        },
        required: ['movie_id'],
      },
    },
  },
];

export async function getMovieOfTheDay(
  apiKey: string,
): Promise<{ error: string } | Awaited<ReturnType<typeof getMovieDetails>>> {
  if (!apiKey) return { error: 'TMDB_API_KEY nie jest ustawiony w .env' };
  const url = `${TMDB_BASE}/trending/movie/day?api_key=${encodeURIComponent(apiKey)}&language=pl-PL`;
  const res = await fetch(url);
  if (!res.ok) return { error: `TMDB ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const candidates = (data.results || []).filter((m: any) => m && m.id);
  if (!candidates.length) return { error: 'Brak filmów w trendach na dziś.' };
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return getMovieDetails(pick.id, apiKey);
}

export async function runTool(call: any, apiKey: string): Promise<any> {
  const name = call.function?.name;
  let args = call.function?.arguments ?? {};
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  console.log(`[tool] -> ${name}(${JSON.stringify(args)})`);
  let result;
  if (name === 'search_movie') result = await searchMovie(args.title || '', apiKey);
  else if (name === 'get_movie_details') result = await getMovieDetails(args.movie_id, apiKey);
  else result = { error: `nieznane narzędzie: ${name}` };
  console.log(
    `[tool] <- ${JSON.stringify(result).slice(0, 200)}${JSON.stringify(result).length > 200 ? '…' : ''}`,
  );
  return result;
}
