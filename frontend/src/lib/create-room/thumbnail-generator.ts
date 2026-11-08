import type { MediaItem } from "./types";

type Options = {
  width?: number;
  height?: number;
  maintainAspectRatio?: boolean;
  blur?: boolean;
};

const blurFilter = "blur(30px)";

export const generateThumbnail = (mediaItem: MediaItem, options: Options) => {
  if (!options.width && !options.height) {
    throw new Error("Must provide width or height");
  }

  try {
    if (mediaItem.item.isImage) {
      return generateImageThumbnail(mediaItem.element as HTMLImageElement, options);
    }

    return generateVideoThumbnail(mediaItem.element as HTMLVideoElement, options, 0);
  } catch (e) {
    console.error("Failed to generate thumbnail", e);
  }
};

const renderImageOnCanvas = (imageElement: HTMLImageElement, options: Options): HTMLCanvasElement => {
  let canvasWidth: number = options.width ?? imageElement.width;
  let canvasHeight: number = options.height ?? imageElement.height;

  if (options.maintainAspectRatio) {
    const aspectRatio: string = `${imageElement.width}:${imageElement.height}`;
    const { width: newWidth, height: newHeight } = getAspectHeightWidth(canvasWidth, canvasHeight, aspectRatio);
    canvasWidth = Math.ceil(newWidth);
    canvasHeight = Math.ceil(newHeight);
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (options.blur) {
      ctx.filter = blurFilter;
    }

    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
  }

  return canvas;
};

const generateImageThumbnail = async (img: HTMLImageElement, options: Options) => {
  const canvas = renderImageOnCanvas(img, options);
  const { height: thumbnailHeight, width: thumbnailWidth } = canvas;
  return {
    blob: await canvasToBlob(canvas),
    width: thumbnailWidth,
    height: thumbnailHeight,
  };
};

const renderVideoOnCanvas = (videoElement: HTMLVideoElement, options: Options): HTMLCanvasElement => {
  const { videoWidth: originalWidth, videoHeight: originalHeight } = videoElement;
  let canvasWidth = Number(options.width) || originalWidth;
  let canvasHeight = Number(options.height) || originalHeight;

  if (options.maintainAspectRatio) {
    const aspectRatio = `${originalWidth}:${originalHeight}`;
    const { width: newWidth, height: newHeight } = getAspectHeightWidth(canvasWidth, canvasHeight, aspectRatio);
    canvasWidth = newWidth;
    canvasHeight = newHeight;
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (options.blur) {
      ctx.filter = blurFilter;
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  }

  return canvas;
};

const generateVideoThumbnail = async (video: HTMLVideoElement, options: Options, timestamp?: number) => {
  const videoTimestamp: number = Number(timestamp) || 0;
  video.currentTime = videoTimestamp;

  await new Promise((resolve) => {
    video.addEventListener("seeked", () => {
      setTimeout(resolve, 200);
    });
  });

  const canvas = renderVideoOnCanvas(video, options);
  const { height: thumbnailHeight, width: thumbnailWidth } = canvas;

  return {
    blob: await canvasToBlob(canvas),
    width: thumbnailWidth,
    height: thumbnailHeight,
  };
};

const getAspectHeightWidth = (width: number, height: number, aspectRatio: string): { height: number; width: number } => {
  const [aspectWidth, aspectHeight] = aspectRatio.split(":").map((num) => Number.parseInt(num, 10));

  const targetAspectRatio = Number((aspectWidth / aspectHeight).toFixed(2));
  const currentAspectRatio = Number((width / height).toFixed(2));

  // Adjust the width or height to maintain the aspect ratio
  if (currentAspectRatio > targetAspectRatio) {
    // Current width is too wide, adjust width
    width = Number((height * targetAspectRatio).toFixed(2));
  } else {
    // Current height is too tall, adjust height
    height = Number((width / targetAspectRatio).toFixed(2));
  }

  return { height, width };
};

const canvasToBlob = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg");
  });
  canvas.width = 0;
  canvas.height = 0;
  if (blob) {
    return blob;
  } else {
    throw new Error("Failed to convert canvas to blob");
  }
};
