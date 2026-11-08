import { ArrayBufferTarget } from "webm-muxer";
import { ReplayPlayer } from "./replay-player";
import type { ReplayLogEvent } from "./types";
import { webmVideoFrameSink } from "./webm-writer";

const puzzleVideoFrameStream = async (logEvents: ReplayLogEvent[],
  options: {
    dimensionPx: number;
    duration: number;
    fps: number;
  }) => {

  const replayPlayer = await ReplayPlayer.create(logEvents, options.dimensionPx);
  const maxMemoryUsage = 128 * 1024 * 1024; // allow up to 128MB of in-flight video frames
  const estMemUsePerFrame = 4 * replayPlayer.canvas.width * replayPlayer.canvas.height;
  const maxInFlightFrames = Math.ceil(maxMemoryUsage / estMemUsePerFrame);

  const frameDuration = 1_000 / options.fps;
  const totalFramesCount = Math.ceil(options.duration / frameDuration);

  let canProcessRes = () => { };
  return [new ReadableStream<[VideoFrame, boolean]>(
    {
      start(controller) {
        replayPlayer.playAllStepsByFrames(totalFramesCount, async (frame, kf) => {
          while (!controller.desiredSize)
            await new Promise<void>(_ => canProcessRes = _);
          replayPlayer.render();
          const timestamp = frame * frameDuration * 1_000; // microseconds
          const videoFrame = new VideoFrame(replayPlayer.canvas, { timestamp });
          controller.enqueue([videoFrame, !!kf]);
        }).then(() => {
          controller.close();
        });
      },
      pull(controller) {
        if (controller.desiredSize)
          canProcessRes();
      },
      cancel() { },
    },
    {
      highWaterMark: maxInFlightFrames,
      size: () => 1,
    },
  ), replayPlayer.canvas, maxInFlightFrames, totalFramesCount] as const;
};

export async function recordReplayVideo2(logEvents: ReplayLogEvent[],
  options: {
    dimensionPx: number;
    duration: number;
    fps: number;
  },
  onProgress: (progress: number) => void
) {
  const target = new ArrayBufferTarget();

  const [videoFrames, canvas, maxInFlightFrames, totalFramesCount] = await puzzleVideoFrameStream(logEvents, options);
  const webmsink = await webmVideoFrameSink(canvas, target, maxInFlightFrames, (n) => {
    onProgress(~~((n / totalFramesCount) * 100));
  });
  await videoFrames.pipeTo(webmsink);
  return target.buffer;
}
