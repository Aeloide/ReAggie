import type { Rectangle, vec2 } from "$room/vec2";
import { getContext, setContext } from "svelte";

export function clamp(val: number, min: number, max: number) {
  return val > min ? (val < max ? val : max) : min;
}

/**
 * A function that debounces another function execution.
 *
 * @param {F} fn - The function to debounce.
 * @param {number} waitFor - The time to wait before executing the debounced function.
 * @return {[() => void, () => void]} An array containing the debounced function and a cancel function, that cancels next scheduled execution.
 */
export function debounce<F extends (...args: Parameters<F>) => ReturnType<F>>(
  fn: F,
  waitFor: number
): [(...args: Parameters<F>) => void, () => void] {
  let timeout: ReturnType<typeof setTimeout>;

  return [
    (...args: Parameters<F>): void => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), waitFor);
    },
    () => {
      clearTimeout(timeout);
    },
  ];
}

type ThrottleFn<F extends (...args: Parameters<F>) => ReturnType<F>> = {
  call: (...args: Parameters<F>) => ReturnType<F> | undefined;
  cancelScheduled: () => void;
  invokeScheduled: () => void;
};

/**
 * Throttles a function execution to a specified delay.
 *
 * @template F - The type of the function to be throttled.
 * @param {F} fn - The function to be throttled.
 * @param {number} delay - The delay in milliseconds.
 * @param {boolean} trailing - Whether to execute the function after the delay.
 * @return {ThrottleFn<F>} - An object containing the throttled function and extra methods.
 */
export function throttle<F extends (...args: Parameters<F>) => ReturnType<F>>(fn: F, delay: number, trailing: boolean = false): ThrottleFn<F> {
  let wait = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<F> | null = null;

  const invoke = (args: Parameters<F>) => fn(...args);

  const throttledFn = (...args: Parameters<F>) => {
    if (wait) {
      if (trailing) {
        lastArgs = args;
      }
      return undefined;
    }

    const result = invoke(args);
    wait = true;

    timeout = setTimeout(() => {
      wait = false;
      if (trailing && lastArgs) {
        invoke(lastArgs);
        lastArgs = null;
      }
    }, delay);

    return result;
  };

  const cancelScheduled = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    lastArgs = null;
    wait = false;
  };

  const invokeScheduled = () => {
    if (!timeout || !lastArgs) {
      return;
    }

    clearTimeout(timeout);
    invoke(lastArgs);
    lastArgs = null;
    wait = false;
  };

  return {
    call: throttledFn,
    cancelScheduled,
    invokeScheduled,
  };
}

/**
 * Round to two decimals
 * @example
 * calcPercent(12.3456) // Returns 12.35
 */
export function calcPercent(n: number) {
  return Math.round(100 * n) / 100;
}

/**
 * Removes the first occurance of a value from an array.
 * @param arr The array.
 * @param obj The value to be removed from the array.
 */
export function extractFromArray<T>(arr: T[], obj: T) {
  const i = arr.indexOf(obj);
  if (i !== -1) {
    return arr.splice(i, 1)[0];
  }
}

export function extractAllFromArray<T>(arr: T[], f: (e: T) => boolean) {
  const ret: T[] = [];
  for (let i = 0; i < arr.length;) {
    if (f(arr[i]))
      ret.push(arr.splice(i, 1)[0])
    else
      ++i;
  }
  return ret;
}

export type RGBA = [r: number, g: number, b: number, a: number];
/**
 * Convert hex color code to RGBA [0.0-1.0] format
 * @example toRgbaNum("#FF8000") //returns [1.0, 0.5, 0.0, 1.0]
 */
export function toRgbaNum(colorCode: string): RGBA {
  const hex = parseInt(colorCode.substr(1), 16);
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, ((hex >> 0) & 255) / 255, 1];
}

export function fromRgb(color: number[]) {
  return `#${color.map((c) => c.toString(2).padStart(2, "0")).join("")}`;
}

export let sleep = (n: number) => new Promise((_) => setTimeout(_, n));

export class Random {
  state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Generate the next psuedorandom number.
   * @param min Minimum (exclusive)
   * @param max Maximum (exclusive)
   */
  nextInterval(min: number, max: number): number {
    return min + ((this.next() + this.next() + this.next() + this.next()) / 4) * (max - min);
  }

  /**
   * Generate the next psuedorandom number
   * @returns Number between 0 (inclusive) and 1 (exclusive)
   */
  next() {
    const n = 1e4 * Math.sin(this.state);
    this.state += 1;
    return n - Math.floor(n);
  }
}

export function addLineNumbers(text: string) {
  const suffix = ": ";
  const lines = text.split("\n");
  const leftPad = (lines.length + suffix).length;
  const formatted: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    formatted.push((i + 1 + suffix).padStart(leftPad, " "), lines[i], "\n");
  }
  return formatted.join("");
}

let aidsctx = new Set<() => void>();
export function aids(node: HTMLElement, args?: string[]) {
  node.classList.add('aids');
  let deps = [...(node.id ? [node.id] : []), ...(args ? args : [])]
  const cb = () => {
    if (deps.every(d => !!localStorage[d]))
      node.classList.remove("aids");
  }
  aidsctx.add(cb)
  node.addEventListener("click", () => {
    if (!node.id)
      return
    localStorage[node.id] = 't'
    aidsctx.forEach(e => e());
  });
  cb();
  return {
    destroy() {
      aidsctx.delete(cb);
    }
  }
}

export function getEmotes(input: string): string[] {
  if (!input) {
    return [];
  }

  const emotes: string[] = [];
  let emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu;
  try {
    emojiRegex = /(\p{RGI_Emoji}|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gv;
  } catch { }
  const textEmoteRegex = /(:[\/\\_A-Za-z0-9]+:)/g;
  let emojiMatch;
  while ((emojiMatch = emojiRegex.exec(input)) !== null) {
    emotes.push(emojiMatch[0]);
  }
  let textMatch;
  while ((textMatch = textEmoteRegex.exec(input)) !== null) {
    emotes.push(textMatch[0]);
  }
  return emotes;
}

export function sendNotification(sub: string, com: string): void {
  fetch("/api/contact", {
    headers: {
      "content-type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify({
      sub,
      com,
    }),
    method: "POST",
    credentials: "same-origin",
  }).catch((error) => {
    console.error("Failed to send notification", error);
  });
}

export class FaviconBadge {
  // private r = Math.ceil(window.devicePixelRatio) || 1
  private size2 = 0;
  private background = 'red'

  get font() {
    return 10 * this.r + 'px arial'
  }

  get r() {
    return this.size2 / 16;
  }

  private canvas: OffscreenCanvas | null = null
  private faviconUrl: string = this.getFaviconUrl()
  private faviconImage: HTMLImageElement | null = null

  private agent = navigator.userAgent.toLowerCase()

  private browser = {
    ie: this.ua('trident'),
    chrome: this.ua('chrome'),
    webkit: this.ua('chrome') || this.ua('safari'),
    safari: this.ua('safari') && !this.ua('chrome'),
    mozilla: this.ua('mozilla') && !this.ua('chrome') && !this.ua('safari'),
  }

  private ua(browser: string) {
    return this.agent.indexOf(browser) !== -1
  }

  private async getFaviconImage(): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      if (this.faviconImage) {
        resolve(this.faviconImage)
        return
      }
      const faviconImage = new Image()
      faviconImage.addEventListener(
        'load',
        () => {
          this.faviconImage = faviconImage
          this.size2 = Math.min(faviconImage.naturalWidth, faviconImage.naturalHeight);
          resolve(faviconImage)
        },
        false
      )
      faviconImage.crossOrigin = 'anonymous'
      faviconImage.src = this.faviconUrl + '?_=' + Math.round(Math.random() * 1000000)
    })
  }

  private async getCanvas() {
    if (this.canvas) {
      return this.canvas
    }
    const faviconImage = await this.getFaviconImage();
    const canvas = new OffscreenCanvas(this.size2, this.size2);
    canvas.width = this.size2
    canvas.height = this.size2
    const context = canvas.getContext('2d', { alpha: true })!
    context.clearRect(0, 0, this.size2, this.size2)
    context.drawImage(faviconImage, 0, 0, faviconImage.width, faviconImage.height, 0, 0, this.size2, this.size2)
    this.canvas = canvas
    return canvas
  }

  private getFaviconUrl() {
    return '/favicon.ico';
  }

  private getFaviconTag() {
    const links = document.getElementsByTagName('link')
    for (let i = 0; i < links.length; i++) {
      if ((links[i].getAttribute('rel') || '').match(/\bicon\b/i)) {
        return links[i]
      }
    }
    return false
  }

  private removeFaviconTag() {
    const links = document.getElementsByTagName('link')
    for (let i = 0, len = links.length; i < len; i++) {
      const exists = typeof links[i] !== 'undefined'
      if (exists && (links[i].getAttribute('rel') || '').match(/\bicon\b/i)) {
        links[i].parentNode!.removeChild(links[i])
      }
    }
  }

  private setFaviconTag(url: string) {
    this.removeFaviconTag()
    const link = document.createElement('link')
    link.type = 'image/x-icon'
    link.rel = 'icon'
    link.href = url
    document.getElementsByTagName('head')[0].appendChild(link)
  }

  private drawBubble(canvas: OffscreenCanvas, label: string, color: string) {
    // bubble needs to be larger for double digits
    const context = canvas.getContext('2d', { alpha: true })!
    // heh fuck this shit
    let top = 0
    let left = 10
    context.font = (this.browser.webkit ? 'bold ' : '') + this.font
    const metrics = context.measureText(label);
    const h = Math.abs(metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent);
    const w = metrics.width;
    // top -= Math.abs(metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent);
    top += canvas.height / 2;
    //  left += metrics.width * 2;
    left += canvas.width / 2;
    const r = 1;
    const bottom = 16 * r
    const right = 16 * r
    const radius = 2 * r

    // webkit seems to render fonts lighter than firefox
    context.fillStyle = this.background
    context.strokeStyle = this.background
    context.lineWidth = r

    // bubble
    context.beginPath()
    context.roundRect(left - w - 2.5, top - 2.5, w + 10, h + 10, 5);
    context.closePath()
    context.fill()

    // label
    context.fillStyle = color
    context.textAlign = 'right'
    context.textBaseline = 'top'

    // unfortunately webkit/mozilla are a pixel different in text positioning
    context.fillText(label, left, top)
  }

  public async draw(label: string, color = '#ffffff') {
    const originalCanvas = await this.getCanvas()
    const newCanvas = new OffscreenCanvas(originalCanvas.width, originalCanvas.height);
    const context = newCanvas.getContext('2d', { alpha: true })!
    newCanvas.width = originalCanvas.width
    newCanvas.height = originalCanvas.height
    context.drawImage(originalCanvas, 0, 0)
    if (label.length > 0) {
      this.drawBubble(newCanvas, label, color)
    }
    this.setFaviconTag(await convertOffscreenCanvasToPNG(newCanvas))
  }

  public reset() {
    this.setFaviconTag(this.faviconUrl)
  }
}


async function convertOffscreenCanvasToPNG(canvas: OffscreenCanvas): Promise<string> {
  try {
    // Convert the OffscreenCanvas to a Blob object with PNG format.
    // The quality argument is optional and applies to 'image/jpeg' or 'image/webp'.
    // For 'image/png', it's lossless and doesn't use the quality argument.
    const blob = await canvas.convertToBlob({ type: 'image/png' });

    // Check if the blob was created successfully.
    if (!blob) {
      throw new Error('Failed to convert OffscreenCanvas to Blob.');
    }

    // Use FileReader to convert the Blob to a data URL.
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      // Event handler for when the FileReader finishes reading.
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          // This case should ideally not happen if readAsDataURL is used
          // and the blob is valid, but it's good practice to handle it.
          reject(new Error('FileReader did not return a string.'));
        }
      };

      // Event handler for any errors during file reading.
      reader.onerror = (error) => {
        reject(new Error(`FileReader error: ${error}`));
      };

      // Start reading the Blob as a data URL.
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error converting OffscreenCanvas to PNG data URL:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

export const isInRectangle = (p: vec2, r: Rectangle) => {
  const xMin = Math.min(r[0][0], r[1][0]);
  const xMax = Math.max(r[0][0], r[1][0]);
  const yMin = Math.min(r[0][1], r[1][1]);
  const yMax = Math.max(r[0][1], r[1][1]);
  return xMin <= p[0] && p[0] <= xMax && yMin <= p[1] && p[1] <= yMax;
}

export function shuffleArray<T extends any[]>(array: T) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}