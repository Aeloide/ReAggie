import { scratchCard } from "$lib/room/scratch-card/scratchCardStore";
import { chatLog, endStats, heldPieces, jukebox, nameTags, pollStore, roomDef, roomState, settings, users, type EndStats, driftStore, processes } from "$lib/room/stores";
import { readable, writable } from "svelte/store";
import type { GameGroup, User } from "./game";
import type { GameViewState } from "./game-view-state";
import { refreshPlaylist, startMusicAt, stopCurrentSong, syncJukebox } from "./jukebox";
import type { NameTagEvent, Room, ScratchCardStatus, track } from "./types";
import type { Rectangle } from "./vec2";
import { game } from "$room";
import { GPU4Renderer } from "./gpu4-renderer";
import { sendNotification } from "../utils";
import { getIntent } from "$lib/utils";


// Define the structure of the report object
interface WebGLReport {
  platform: string;
  userAgent: string;
  webglVersion: 1 | 2;
  contextName: 'webgl' | 'webgl2';

  glVersion: string | null;
  shadingLanguageVersion: string | null;
  vendor: string | null;
  renderer: string | null;
  unmaskedVendor: string;
  unmaskedRenderer: string;
  antialias: boolean | 'Not available'; // Based on original: 'Available' / 'Not available'
  angle: string;

  maxColorBuffers?: number; // For WebGL1 via extension, or general info

  redBits: number | null;
  greenBits: number | null;
  blueBits: number | null;
  alphaBits: number | null;
  depthBits: number | null;
  stencilBits: number | null;

  maxRenderBufferSize: number | null;
  maxCombinedTextureImageUnits: number | null;
  maxCubeMapTextureSize: number | null;
  maxFragmentUniformVectors: number | null;
  maxTextureImageUnits: number | null;
  maxTextureSize: number | null;
  maxVaryingVectors: number | null; // WebGL1
  maxVertexAttributes: number | null;
  maxVertexTextureImageUnits: number | null;
  maxVertexUniformVectors: number | null;

  aliasedLineWidthRange: string;
  aliasedPointSizeRange: string;
  maxViewportDimensions: string;
  maxAnisotropy: number | 'n/a';

  vertexShaderBestPrecision: string;
  fragmentShaderBestPrecision: string;
  fragmentShaderFloatIntPrecision: string;

  webgl2Status?: string;

  // WebGL2 Specific (only if WebGL2)
  maxVertexUniformComponents?: number | 'n/a';
  maxVertexUniformBlocks?: number | 'n/a';
  maxVertexOutputComponents?: number | 'n/a';
  maxVaryingComponents?: number | 'n/a'; // WebGL2
  maxFragmentUniformComponents?: number | 'n/a';
  maxFragmentUniformBlocks?: number | 'n/a';
  maxFragmentInputComponents?: number | 'n/a';
  minProgramTexelOffset?: number | 'n/a';
  maxProgramTexelOffset?: number | 'n/a';
  maxDrawBuffers?: number | 'n/a'; // WebGL2 (MAX_DRAW_BUFFERS)
  maxColorAttachments?: number | 'n/a';
  maxSamples?: number | 'n/a';
  max3dTextureSize?: number | 'n/a';
  maxArrayTextureLayers?: number | 'n/a';
  maxTextureLodBias?: number | 'n/a';
  maxUniformBufferBindings?: number | 'n/a';
  maxUniformBlockSize?: number | 'n/a';
  uniformBufferOffsetAlignment?: number | 'n/a';
  maxCombinedUniformBlocks?: number | 'n/a';
  maxCombinedVertexUniformComponents?: number | 'n/a';
  maxCombinedFragmentUniformComponents?: number | 'n/a';
  maxTransformFeedbackInterleavedComponents?: number | 'n/a';
  maxTransformFeedbackSeparateAttribs?: number | 'n/a';
  maxTransformFeedbackSeparateComponents?: number | 'n/a';
  maxElementIndex?: number | 'n/a';
  maxServerWaitTimeout?: number | 'n/a';
}

// Helper function to safely get GL parameters, returning 'n/a' or a default on null/error
function getParameterSafe(gl: WebGLRenderingContext | WebGL2RenderingContext, pname: number): any | 'n/a' {
  const value = gl.getParameter(pname);
  if (value === null) {
    // Check if context is lost, which can cause getParameter to return null
    if (gl.isContextLost()) {
      return 'n/a (context lost)';
    }
    return 'n/a';
  }
  return value;
}

function describeRange(value: any): string {
  if (!value || value.length !== 2) {
    return '[n/a, n/a]';
  }
  return `[${value[0]}, ${value[1]}]`;
}

function formatPower(exponent: number, verbose: boolean): string {
  if (verbose) {
    return `${Math.pow(2, exponent)}`;
  } else {
    // In a non-DOM environment, <sup> might not be ideal.
    // Returning as string for consistency with original.
    return `2^${exponent}`; // Simpler alternative: `Math.pow(2, exponent)`
  }
}

function getPrecisionDescription(gl: WebGLRenderingContext | WebGL2RenderingContext, precisionFormat: WebGLShaderPrecisionFormat | null, verbose: boolean): string {
  if (!precisionFormat) {
    return 'n/a';
  }
  const verbosePart = verbose ? ' bit mantissa' : '';
  return `[-${formatPower(precisionFormat.rangeMin, verbose)}, ${formatPower(precisionFormat.rangeMax, verbose)}] (${precisionFormat.precision}${verbosePart})`;
}

function getBestFloatPrecision(gl: WebGLRenderingContext | WebGL2RenderingContext, shaderType: number): string {
  const high = gl.getShaderPrecisionFormat(shaderType, gl.HIGH_FLOAT);
  const medium = gl.getShaderPrecisionFormat(shaderType, gl.MEDIUM_FLOAT);
  const low = gl.getShaderPrecisionFormat(shaderType, gl.LOW_FLOAT);

  let best = high;
  if (high && high.precision === 0) { // Check if high is null or precision is 0
    best = medium;
  }
  if (!best && medium && medium.precision === 0) { // if best (high) was null and medium precision is 0
    best = low;
  }
  if (!best) { // If all are null (should not happen in valid context but good for robustness)
    return 'Precision lookup failed';
  }

  // Original used a <span title="..."> for hover effect.
  // Here, we'll create a string representation.
  const highDesc = getPrecisionDescription(gl, high, true);
  const mediumDesc = getPrecisionDescription(gl, medium, true);
  const lowDesc = getPrecisionDescription(gl, low, true);
  const bestDesc = getPrecisionDescription(gl, best, false);

  return `Best: ${bestDesc} (High: ${highDesc}, Medium: ${mediumDesc}, Low: ${lowDesc})`;
}

function getFloatIntPrecision(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  let s = '';
  const highFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  s += (highFloat && highFloat.precision !== 0) ? 'highp/' : 'mediump/';

  const highInt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_INT);
  s += (highInt && highInt.rangeMax !== 0) ? 'highp' : 'lowp';

  return s;
}

function isPowerOfTwo(n: number): boolean {
  return (n !== 0) && ((n & (n - 1)) === 0);
}

function getAngle(gl: WebGLRenderingContext | WebGL2RenderingContext, platform: string): string {
  const lineWidthRange = describeRange(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE));
  const renderer = gl.getParameter(gl.RENDERER);

  const isWindows = (platform === 'Win32') || (platform === 'Win64');
  const isIE = renderer === 'Internet Explorer';
  const isEdge = renderer === 'Microsoft Edge'; // Original had 'Microsoft Edge'

  // Heuristic from original script
  if (isWindows && !isIE && !isEdge && lineWidthRange === describeRange([1, 1])) {
    const maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
    const maxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);

    if (typeof maxVertexUniformVectors === 'number' && typeof maxFragmentUniformVectors === 'number' &&
      isPowerOfTwo(maxVertexUniformVectors) && isPowerOfTwo(maxFragmentUniformVectors)) {
      return 'Yes, D3D11';
    } else {
      return 'Yes, D3D9';
    }
  }
  return 'No';
}

function getMaxAnisotropy(gl: WebGLRenderingContext | WebGL2RenderingContext): number | 'n/a' {
  const ext = gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
    gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
  if (ext) {
    let max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    if (max === 0) { // Bug fix from original
      max = 2;
    }
    return max;
  }
  return 'n/a';
}

function getUnmaskedInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): { vendor: string, renderer: string; } {
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (debugInfo) {
    return {
      vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "",
      renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ""
    };
  }
  return { vendor: "", renderer: "" };
}

function getMaxColorBuffers(gl: WebGLRenderingContext): number {
  // For WebGL1. WebGL2 uses gl.getParameter(gl.MAX_DRAW_BUFFERS).
  const ext = gl.getExtension("WEBGL_draw_buffers");
  if (ext) {
    const value = gl.getParameter(ext.MAX_DRAW_BUFFERS_WEBGL);
    return typeof value === 'number' ? value : 1;
  }
  return 1;
}

function getWebGL2FunctionStatus(gl: WebGL2RenderingContext): string {
  // This list is from the original script.
  const webgl2Names = [
    'copyBufferSubData', 'getBufferSubData', 'blitFramebuffer', 'framebufferTextureLayer',
    'getInternalformatParameter', 'invalidateFramebuffer', 'invalidateSubFramebuffer',
    'readBuffer', 'renderbufferStorageMultisample', 'texStorage2D', 'texStorage3D',
    'texImage3D', 'texSubImage3D', 'copyTexSubImage3D', 'compressedTexImage3D',
    'compressedTexSubImage3D', 'getFragDataLocation', 'uniform1ui', 'uniform2ui',
    'uniform3ui', 'uniform4ui', 'uniform1uiv', 'uniform2uiv', 'uniform3uiv',
    'uniform4uiv', 'uniformMatrix2x3fv', 'uniformMatrix3x2fv', 'uniformMatrix2x4fv',
    'uniformMatrix4x2fv', 'uniformMatrix3x4fv', 'uniformMatrix4x3fv', 'vertexAttribI4i',
    'vertexAttribI4iv', 'vertexAttribI4ui', 'vertexAttribI4uiv', 'vertexAttribIPointer',
    'vertexAttribDivisor', 'drawArraysInstanced', 'drawElementsInstanced',
    'drawRangeElements', 'drawBuffers', 'clearBufferiv', 'clearBufferuiv',
    'clearBufferfv', 'clearBufferfi', 'createQuery', 'deleteQuery', 'isQuery',
    'beginQuery', 'endQuery', 'getQuery', 'getQueryParameter', 'createSampler',
    'deleteSampler', 'isSampler', 'bindSampler', 'samplerParameteri', 'samplerParameterf',
    'getSamplerParameter', 'fenceSync', 'isSync', 'deleteSync', 'clientWaitSync',
    'waitSync', 'getSyncParameter', 'createTransformFeedback', 'deleteTransformFeedback',
    'isTransformFeedback', 'bindTransformFeedback', 'beginTransformFeedback',
    'endTransformFeedback', 'transformFeedbackVaryings', 'getTransformFeedbackVarying',
    'pauseTransformFeedback', 'resumeTransformFeedback', 'bindBufferBase',
    'bindBufferRange', 'getIndexedParameter', 'getUniformIndices', 'getActiveUniforms',
    'getUniformBlockIndex', 'getActiveUniformBlockParameter', 'getActiveUniformBlockName',
    'uniformBlockBinding', 'createVertexArray', 'deleteVertexArray', 'isVertexArray',
    'bindVertexArray'
  ];

  let totalImplemented = 0;
  for (const name of webgl2Names) {
    if ((gl as any)[name]) {
      totalImplemented++;
    }
  }
  return `${totalImplemented} of ${webgl2Names.length} new WebGL2 functions implemented.`;
}


export function getWebGLReport(gl: WebGLRenderingContext | WebGL2RenderingContext): WebGLReport {
  const isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
  const contextAttributes = gl.getContextAttributes();

  const unmasked = getUnmaskedInfo(gl);

  const report: WebGLReport = {
    platform: (typeof navigator !== 'undefined') ? navigator.platform : 'n/a',
    userAgent: (typeof navigator !== 'undefined') ? navigator.userAgent : 'n/a',
    webglVersion: isWebGL2 ? 2 : 1,
    contextName: isWebGL2 ? 'webgl2' : 'webgl',

    glVersion: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    unmaskedVendor: unmasked.vendor,
    unmaskedRenderer: unmasked.renderer,

    antialias: contextAttributes?.antialias ?? 'Not available',
    angle: getAngle(gl, (typeof navigator !== 'undefined') ? navigator.platform : ''),

    redBits: gl.getParameter(gl.RED_BITS),
    greenBits: gl.getParameter(gl.GREEN_BITS),
    blueBits: gl.getParameter(gl.BLUE_BITS),
    alphaBits: gl.getParameter(gl.ALPHA_BITS),
    depthBits: gl.getParameter(gl.DEPTH_BITS),
    stencilBits: gl.getParameter(gl.STENCIL_BITS),

    maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
    maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxVaryingVectors: isWebGL2 ? null : gl.getParameter(gl.MAX_VARYING_VECTORS), // WebGL1 only
    maxVertexAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
    maxVertexTextureImageUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),

    aliasedLineWidthRange: describeRange(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)),
    aliasedPointSizeRange: describeRange(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)),
    maxViewportDimensions: describeRange(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
    maxAnisotropy: getMaxAnisotropy(gl),

    vertexShaderBestPrecision: getBestFloatPrecision(gl, gl.VERTEX_SHADER),
    fragmentShaderBestPrecision: getBestFloatPrecision(gl, gl.FRAGMENT_SHADER),
    fragmentShaderFloatIntPrecision: getFloatIntPrecision(gl),
  };

  if (isWebGL2) {
    const gl2 = gl as WebGL2RenderingContext;
    report.webgl2Status = getWebGL2FunctionStatus(gl2);
    report.maxColorBuffers = gl2.getParameter(gl2.MAX_DRAW_BUFFERS); // WebGL2 standard

    report.maxVertexUniformComponents = getParameterSafe(gl2, gl2.MAX_VERTEX_UNIFORM_COMPONENTS);
    report.maxVertexUniformBlocks = getParameterSafe(gl2, gl2.MAX_VERTEX_UNIFORM_BLOCKS);
    report.maxVertexOutputComponents = getParameterSafe(gl2, gl2.MAX_VERTEX_OUTPUT_COMPONENTS);
    report.maxVaryingComponents = getParameterSafe(gl2, gl2.MAX_VARYING_COMPONENTS);
    report.maxFragmentUniformComponents = getParameterSafe(gl2, gl2.MAX_FRAGMENT_UNIFORM_COMPONENTS);
    report.maxFragmentUniformBlocks = getParameterSafe(gl2, gl2.MAX_FRAGMENT_UNIFORM_BLOCKS);
    report.maxFragmentInputComponents = getParameterSafe(gl2, gl2.MAX_FRAGMENT_INPUT_COMPONENTS);
    report.minProgramTexelOffset = getParameterSafe(gl2, gl2.MIN_PROGRAM_TEXEL_OFFSET);
    report.maxProgramTexelOffset = getParameterSafe(gl2, gl2.MAX_PROGRAM_TEXEL_OFFSET);
    report.maxDrawBuffers = getParameterSafe(gl2, gl2.MAX_DRAW_BUFFERS); // Alias for clarity, already set as maxColorBuffers for WebGL2
    report.maxColorAttachments = getParameterSafe(gl2, gl2.MAX_COLOR_ATTACHMENTS);
    report.maxSamples = getParameterSafe(gl2, gl2.MAX_SAMPLES);
    report.max3dTextureSize = getParameterSafe(gl2, gl2.MAX_3D_TEXTURE_SIZE);
    report.maxArrayTextureLayers = getParameterSafe(gl2, gl2.MAX_ARRAY_TEXTURE_LAYERS);
    report.maxTextureLodBias = getParameterSafe(gl2, gl2.MAX_TEXTURE_LOD_BIAS);
    report.maxUniformBufferBindings = getParameterSafe(gl2, gl2.MAX_UNIFORM_BUFFER_BINDINGS);
    report.maxUniformBlockSize = getParameterSafe(gl2, gl2.MAX_UNIFORM_BLOCK_SIZE);
    report.uniformBufferOffsetAlignment = getParameterSafe(gl2, gl2.UNIFORM_BUFFER_OFFSET_ALIGNMENT);
    report.maxCombinedUniformBlocks = getParameterSafe(gl2, gl2.MAX_COMBINED_UNIFORM_BLOCKS);
    report.maxCombinedVertexUniformComponents = getParameterSafe(gl2, gl2.MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS);
    report.maxCombinedFragmentUniformComponents = getParameterSafe(gl2, gl2.MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS);
    report.maxTransformFeedbackInterleavedComponents = getParameterSafe(gl2, gl2.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS);
    report.maxTransformFeedbackSeparateAttribs = getParameterSafe(gl2, gl2.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS);
    report.maxTransformFeedbackSeparateComponents = getParameterSafe(gl2, gl2.MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS);
    report.maxElementIndex = getParameterSafe(gl2, gl2.MAX_ELEMENT_INDEX);
    report.maxServerWaitTimeout = getParameterSafe(gl2, gl2.MAX_SERVER_WAIT_TIMEOUT);
  } else {
    report.webgl2Status = 'WebGL2 not available or not used.';
    report.maxColorBuffers = getMaxColorBuffers(gl as WebGLRenderingContext);
  }

  return report;
}

export class UiStateHandler {
  async doBotnet() {
    const r = game.renderer;
    if (!r)
      return;
    if (r instanceof GPU4Renderer) {
      if (r.gl.canvas instanceof HTMLCanvasElement) {
        const b = await new Promise<Blob | null>(_ => (r.gl.canvas as HTMLCanvasElement).toBlob(_));
        let intent: string | Awaited<ReturnType<typeof getIntent>> = 'no intent';
        if (b) {
          intent = await getIntent();
          await intent.uploadFile(new File([b], 'screenshot.png', { type: 'image/png' }));
        }
        sendNotification('graphics report', `
            ${intent},
            ${JSON.stringify(getWebGLReport(r.gl), null, 2)}`);
      }
    }
  }

  syncUsers(newUsers: User[]) {
    nameTags.sync(newUsers);
    users.set(newUsers);
  }

  updateDrift(d: number | undefined) {
    driftStore.set(d);
  }

  syncRoomDef(newRoomDef: Room) {
    roomDef.set(newRoomDef);
    syncJukebox(newRoomDef);
  }

  updateRoomDef(newRoomDef: Room) {
    roomDef.set(newRoomDef);
  }

  updateEndStats(newRoomDef: EndStats) {
    endStats.set(newRoomDef);
  }

  addChatMessage(id: number, name: string, color: string, message: string, ts: number = Date.now()) {
    chatLog.addMessage({ id, name, color, message, timeStamp: ts });
  }

  addEmoteMessage(id: number, name: string, color: string, emotes: string[]) {
    chatLog.addEmote({ id, name, color, emotes });
  }

  addProc(id: number, code: string) {
    processes.update(p => {
      const old = p.find(e => e.id === id);
      if (!old)
        return p.concat({ id, code: writable(code) });
      old.code.set(code);
      return p;
    });
  }

  removeProc(id: number) {
    processes.update(p => p.filter(e => e.id != id));
  }

  jukeboxSyncPoints(qty: number) {
    jukebox.setQty(qty);
  }

  jukeboxSyncPlaylist(
    roomDef: Room,
    playlist?: track[],
    currentlyPlaying?: string,
    ext?: string,
    timeStarted?: number,
    stop?: boolean,
    minPrice?: number,
    reschedule?: boolean
  ) {
    if (minPrice) jukebox.setMinPrice(minPrice);
    if (playlist) refreshPlaylist(playlist);
    if (reschedule) {
      if (timeStarted) startMusicAt(roomDef, timeStarted, currentlyPlaying!, ext);
    }
    if (stop) {
      stopCurrentSong();
    }
  }

  scratchCardSync(choice?: number, val?: number, pts?: number, status?: ScratchCardStatus | "start") {
    if (choice !== undefined) {
      scratchCard.setValue(choice, val!);
    }

    if (status === "start") {
      scratchCard.open();
      return;
    }

    if (status) {
      scratchCard.complete(status, pts!);
    }
  }

  recountHeldPieces(groups: GameGroup[]) {
    const counts = new Map<number, number>();
    for (const group of groups) {
      if (!group.user) continue;
      const countForUser = counts.get(group.user.id) || 0;
      counts.set(group.user.id, countForUser + group.pieces.length);
    }

    heldPieces.set(counts);
  }

  drawTagEvent(userId: number, group: GameGroup, view: GameViewState, type?: NameTagEvent) {
    /* Special case for right-clicking unselected pieces.
     * Anti-clockwise rotation can be done without PICK or SELECT */
    if (type === "rotate") {
      if (group.user || settings.snapshot().hidenametags) {
        return;
      }
    }

    nameTags.drawEvent(userId, group.x, group.y, view.x, view.y, view.scale, type);
  }

  syncPoll(zoneMsg: { question?: string; zones: [label: string, region: Rectangle][]; }) {
    // TODO: submit a warning if unsupported renderer? I'm only doing it on GPU4 tbh
    pollStore.set(zoneMsg);
  }

  refreshLockedDisplay(groups: GameGroup[]) {
    let locked = 0;
    for (const group of groups) {
      if (group.locked) {
        locked++;
      }
    }

    roomState.update((x) => {
      x.lockedPiecesCount = locked;
      return x;
    });
  }

  updateSecret(secret: string, roomName: string) {
    localStorage.setItem("secret:" + roomName, secret);
    settings.update((x) => {
      x.secretforthisroom = secret;
      return x;
    });
  }
}
