const GCS_BASE_URL = 'https://storage.googleapis.com/zkap-static-config';
const FETCH_TIMEOUT = 15_000;

export async function fetchGcsJson<T>(path: string): Promise<T> {
  const url = `${GCS_BASE_URL}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`GCS fetch failed: ${url} (${response.status})`);
    }
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}
