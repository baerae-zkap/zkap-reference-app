import { fetchGcsJson } from '../gcsClient';

const GCS_BASE_URL = 'https://storage.googleapis.com/zkap-static-config';

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('fetchGcsJson', () => {
  it('returns parsed JSON on success', async () => {
    const mockData = { chainId: 84532, name: 'Base Sepolia' };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response);

    const result = await fetchGcsJson('chains/84532.json');

    expect(fetch).toHaveBeenCalledWith(
      `${GCS_BASE_URL}/chains/84532.json`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result).toEqual(mockData);
  });

  it('throws on non-OK HTTP status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await expect(fetchGcsJson('chains/9999.json')).rejects.toThrow(
      'GCS fetch failed'
    );
  });

  it('throws on network error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Network request failed'));

    await expect(fetchGcsJson('chains/84532.json')).rejects.toThrow(
      'Network request failed'
    );
  });

  it('throws AbortError on timeout', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      () => new Promise((_, reject) => {
        setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 50);
      })
    );

    await expect(fetchGcsJson('chains/84532.json')).rejects.toThrow('Aborted');
  });
});
