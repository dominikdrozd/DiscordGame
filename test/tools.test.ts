import { searchMovie, getMovieDetails, runTool } from '../src/tools.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('tools', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('searchMovie', () => {
    test('returns error if no API key', async () => {
      const res = await searchMovie('Inception', '');
      expect(res).toHaveProperty('error');
    });

    test('searches and maps results', async () => {
      const mockData = {
        results: [
          {
            id: 1,
            title: 'Movie 1',
            original_title: 'Orig',
            release_date: '2023-01-01',
            overview: 'Desc',
            vote_average: 8.5,
            popularity: 10,
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => mockData });

      const res = await searchMovie('Movie 1', 'key');
      expect(res).not.toHaveProperty('error');
      expect((res as any).results).toHaveLength(1);
      expect((res as any).results[0].id).toBe(1);
    });

    test('handles fetch error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => 'Server Error' });

      const res = await searchMovie('Movie', 'key');
      expect(res).toHaveProperty('error');
      expect((res as any).error).toContain('500');
    });
  });

  describe('getMovieDetails', () => {
    test('returns error if no API key', async () => {
      const res = await getMovieDetails(1, '');
      expect(res).toHaveProperty('error');
    });

    test('formats details correctly', async () => {
      const mockData = {
        id: 1,
        title: 'Movie 1',
        original_title: 'Movie 1',
        release_date: '2023-01-01',
        runtime: 120,
        genres: [{ name: 'Action' }],
        vote_average: 8.5,
        vote_count: 100,
        overview: 'A great movie',
        credits: {
          crew: [{ job: 'Director', name: 'Director Name' }],
          cast: [{ name: 'Actor 1', character: 'Role 1' }],
        },
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => mockData });

      const res = await getMovieDetails(1, 'key');
      expect(res).toHaveProperty('formatted');
      expect((res as any).formatted).toContain('reżyseria: Director Name');
      expect((res as any).formatted).toContain('obsadzie m.in. Actor 1');
    });
  });

  describe('runTool', () => {
    test('runs search_movie', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ results: [] }) });
      const call = { function: { name: 'search_movie', arguments: { title: 'Test' } } };
      const res = await runTool(call, 'key');
      expect(res).toHaveProperty('query');
    });

    test('runs get_movie_details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => ({
          id: 1,
          title: 'T',
          original_title: 'T',
          release_date: '2000-01-01',
          vote_average: 5,
          vote_count: 1,
          genres: [],
          overview: 'X',
          credits: {},
        }),
      });
      const call = { function: { name: 'get_movie_details', arguments: { movie_id: 1 } } };
      const res = await runTool(call, 'key');
      expect(res).toHaveProperty('formatted');
    });

    test('returns error for unknown tool', async () => {
      const call = { function: { name: 'unknown', arguments: {} } };
      const res = await runTool(call, 'key');
      expect(res).toHaveProperty('error');
      expect((res as any).error).toContain('nieznane narzędzie');
    });

    test('handles string arguments', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ results: [] }) });
      const call = { function: { name: 'search_movie', arguments: '{"title": "Test"}' } };
      const res = await runTool(call, 'key');
      expect(res).toHaveProperty('query');
    });
  });
});
