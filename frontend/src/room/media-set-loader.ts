import type { PSet } from "$backend/types";
import { getAssetUrl } from "$lib";

export type MediaSetDownloadResult<T = PSet> = {
  element: HTMLVideoElement | HTMLImageElement;
  isVideo: boolean;
  url: string;
  width: number;
  height: number;
  set?: T;
  isSecond: boolean;
};

type ProgressCallback = (done: number, total: number) => void;

export class MediaSetLoader {
  public static waitAll(promises: Promise<MediaSetDownloadResult>[]) {
    return Promise.all(promises);
  }

  public static async waitAsap(promises: Promise<MediaSetDownloadResult>[], onItem: (item: MediaSetDownloadResult) => void) {
    for (const promise of promises) {
      promise.then(onItem, () => {});
    }

    return await Promise.all(promises);
  }

  public static preparePromises(items: PSet[], onProgress?: ProgressCallback): Promise<MediaSetDownloadResult>[] {
    const total = items.reduce((a, b) => a + (b.image2 ? 2 : 1), 0);
    let done = 0;
    let errorOccurred = false;

    onProgress?.(done, total);

    const promises = items.flatMap((item) => {
      const doShit = async (path: string, isVideo: boolean, isSecond: boolean) => {
        const url = getAssetUrl(path);
        try {
          const result = await (isVideo ? this.loadVideo(url, item, isSecond) 
          : this.loadImage(url, item, isSecond));

          // do not report progress if anything crashed for other media items
          if (!errorOccurred) {
            onProgress?.(++done, total);
          }

          return result;
        } catch (error) {
          errorOccurred = true;
          throw error;
        }

      }

      let ret = [doShit(item.image, !!item.isvideo, false)]
      if (item.image2) {
        console.log('loading secondary')
        ret.push(doShit(item.image2, !!item.isvideo2, true))
      }
      return ret;
    });

    return promises;
  }

  public static loadVideo(url: string, set: PSet, isSecond: boolean): Promise<MediaSetDownloadResult> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };
      video.crossOrigin = "anonymous"; // Dunno if cloudflare needs CORS?
      video.playsInline = true;
      video.muted = true;
      video.loop = true;
      video.src = url;

      // Guarantees available video data. See https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Animating_textures_in_WebGL
      let playing = false;
      let timeupdate = false;
      const timeout = setTimeout(() => reject(new Error(`Timed out loading video: ${url}`)), 30_000);
      const checkReady = () => {
        if (playing && timeupdate) {
          clearTimeout(timeout);
          resolve({
            element: video,
            isVideo: true,
            url,
            width: video.videoWidth,
            height: video.videoHeight,
            set,
            isSecond
          });
        }
      };
      video.addEventListener(
        "playing",
        () => {
          playing = true;
          checkReady();
        },
        { once: true }
      );
      video.addEventListener(
        "timeupdate",
        () => {
          timeupdate = true;
          checkReady();
        },
        { once: true }
      );
      void video.play().catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  public static loadImage<T>(url: string, set?: T, isSecond: boolean = false): Promise<MediaSetDownloadResult<T>> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => reject(new Error(`Timed out loading image: ${url}`)), 30_000);
      image.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };
      image.crossOrigin = "anonymous"; // Dunno if cloudflare needs CORS?
      image.src = url;
      image.onload = () => {
        clearTimeout(timeout);
        resolve({
          element: image,
          isVideo: false,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          set,
          isSecond
        });
      };
    });
  }
}
