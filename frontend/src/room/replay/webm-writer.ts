import { Muxer, FileSystemWritableFileStreamTarget, ArrayBufferTarget } from "webm-muxer";

// is a sink, but could be further be split into a transform stream
export async function webmVideoFrameSink(canvas: OffscreenCanvas | HTMLCanvasElement, target: FileSystemWritableFileStreamTarget | ArrayBufferTarget, maxInFlightFrames: number, cb: (n: number) => void) {
  const width = Math.floor(canvas.width / devicePixelRatio);
  const height = Math.floor(canvas.height / devicePixelRatio);

  const muxer = new Muxer({
    target,
    video: {
      codec: "V_VP9",
      width: width,
      height: height,
    },
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error(e),
  });

  videoEncoder.configure({
    codec: "vp09.00.10.08",
    width: width,
    height: height,
    bitrate: 5e6,
  });
  let lastKeyFrame = -Infinity;
  let encodedFrames = 0;
  videoEncoder.addEventListener("dequeue", () => {
    encodedFrames++;
    cb(encodedFrames);
  });
  return new WritableStream<[VideoFrame, boolean]>(
    {
      start(controller) { },
      async write([chunk, keyFrame], controller) {
        while (videoEncoder.encodeQueueSize >= maxInFlightFrames) {
          await new Promise<void>(_ => videoEncoder.addEventListener("dequeue", () => _(), { once: true }));
        }
        let timestamp = chunk.timestamp;
        keyFrame = keyFrame || (timestamp - lastKeyFrame >= 10_000_000);
        if (keyFrame)
          lastKeyFrame = timestamp;
        videoEncoder.encode(chunk, { keyFrame });
        chunk.close();
      },
      async close() {
        await videoEncoder.flush();
        muxer.finalize();
      },
      abort(reason) { },
    },
    {
      highWaterMark: maxInFlightFrames,
      size: () => 1,
    },
  );
}
