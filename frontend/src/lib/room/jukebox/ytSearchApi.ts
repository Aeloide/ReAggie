// public instances: https://redirect.invidious.io
// downtime monitor: https://uptime.invidious.io/
// prettier-ignore
const baseUrls = [
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://inv.nadeko.net"
];

const JUKEBOX_SOURCE_STORAGE_KEY = "jukebox-source";

function setJukeboxSource(url: string) {
  const now = new Date();

  const oneDay = 24 * 60 * 60 * 1000;
  const threeDays = 3 * oneDay;
  const expiryDate = now.getTime() + threeDays;

  const urlIndex = Math.max(baseUrls.indexOf(url), 0);
  const item = {
    index: urlIndex,
    expiry: expiryDate,
  };

  localStorage.setItem(JUKEBOX_SOURCE_STORAGE_KEY, JSON.stringify(item));
}

function getJukeboxSourceIndex() {
  const item = localStorage.getItem(JUKEBOX_SOURCE_STORAGE_KEY);
  if (!item) {
    return;
  }

  const { index, expiry } = JSON.parse(item);
  if (new Date().getTime() > expiry) {
    localStorage.removeItem(JUKEBOX_SOURCE_STORAGE_KEY);
    return;
  }

  return index;
}

export interface Song {
  title: string;
  videoId: string;
  lengthSeconds?: number;
  videoThumbnails: {
    quality: string;
    url: string;
  }[];

  thumbnail?: string;
}

function firstResolve<T>(promises: Promise<T>[]) {
  return new Promise<T>((resolve, reject) => {
    let rejections = 0;

    promises.forEach((promise) => {
      Promise.resolve(promise)
        .then((value) => {
          resolve(value);
        })
        .catch(() => {
          rejections += 1;
          if (rejections === promises.length) {
            reject(new Error('All promises were rejected'));
          }
        });
    });
  });
}

async function invokeRequestFastestImpl<T>(action: (baseUrl: string, stop: AbortSignal) => Promise<T>): Promise<T> {
  const stop = new AbortController();

  let tasks = baseUrls.map((url) => ({ url, promise: action(url, stop.signal) }));

  while (tasks.length > 0) {
    try {
      const { url, result } = await firstResolve(
        tasks.map(async (x) => {
          try {
            const result = await x.promise;
            return { url: x.url, result };
          } catch (error) {
            throw { url: x.url, error };
          }
        })
      );
      stop.abort(); // we good
      setJukeboxSource(url);
      return result;
    } catch (e: any) {
      if (!e.url) // from all tasks failing
        throw "Failed to fetch JSON";
      tasks = tasks.filter((x) => x.url !== e.url);
    }
  }

  throw "Failed to fetch JSON";
}

async function invokeRequestSequentialImpl<T>(action: (baseUrl: string, stop: AbortSignal) => Promise<T>): Promise<T> {
  const stop = AbortSignal.timeout(5000);
  let attempt = 1;
  let urlIndex = Math.max(getJukeboxSourceIndex() || 0, 0) % baseUrls.length;
  while (true) {
    try {
      const url = baseUrls[urlIndex];
      const result = await action(url, stop);
      setJukeboxSource(url);
      return result;
    } catch (error) {
      urlIndex = (urlIndex + 1) % baseUrls.length;
      if (attempt < baseUrls.length) {
        console.log(attempt)
        attempt++;
      } else {
        throw error;
      }
    }
  }
}

async function invokeRequest<T>(action: (baseUrl: string, stop: AbortSignal) => Promise<T>): Promise<T> {
  const urlIndex = getJukeboxSourceIndex();
  if (urlIndex === undefined) {
    return await invokeRequestFastestImpl(action);
  }

  return await invokeRequestSequentialImpl(action);
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const data = await fetch(url, { signal });
  if (data.ok) {
    return await data.json();
  }

  throw "Failed to fetch JSON";
}

export async function searchSongsByQuery(query: string): Promise<Song[]> {
  return await invokeRequest(async (baseUrl, stop) => {
    // short = <4 min, medium = 4-20 min
    const url = `${baseUrl}/api/v1/search?q=${query}&duration=short,medium&type=video`;
    const songs = await fetchJson<Song[]>(url, stop);

    return songs
      .filter((x) => isDurationValid(x))
      .slice(0, 10)
      .map((x) => {
        return {
          ...x,
          thumbnail: getThumbnailUrl(x),
        };
      });
  });
}

function isDurationValid(song: Song) {
  if (!song.lengthSeconds) {
    return false;
  }

  return song.lengthSeconds >= 80 && song.lengthSeconds <= 6 * 60 + 20;
}

function getThumbnailUrl(song: Song) {
  const smallThumbnail = song.videoThumbnails.find((x) => x.quality === "default");
  return smallThumbnail?.url || song.videoThumbnails[0]?.url;
}

export async function getSongByVideoId(videoId: string): Promise<Song[]> {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const songs = await searchSongsByQuery(ytUrl);
    const targetSong = songs.find((x) => x.videoId === videoId);
    if (targetSong) {
      return [targetSong];
    }

    return [];
  } catch (error) {
    return [];
  }
}
