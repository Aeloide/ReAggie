import { IndexBuffer, VertexBuffer, VertexBufferAssembly } from "safe-gl";
import type { Camera2D } from "./Camera2D";
import type { JigGL } from "./gpu4-renderer";
import rectshader from "./rect.glsl";

export class RectangleDrawer {
  private readonly program;
  private readonly positions = new Float32Array(2 * 4);
  private readonly gl;
  private readonly positionBuffer;
  private readonly camera;

  constructor(private jigGl: JigGL, camera: Camera2D) {
    const gl = this.gl = jigGl.gl;
    this.program = new rectshader(jigGl.glx);
    this.camera = camera;

    const positions = this.positionBuffer = new VertexBuffer(gl, "STREAM_DRAW", ["position", "vec2"]);
    positions.set(this.positions);
    const idx = new IndexBuffer(gl, "STATIC_DRAW", "UNSIGNED_BYTE");
    idx.set(new Uint8Array([0, 2, 1, 3, 0, 1]));
    this.program.setAssembly(new VertexBufferAssembly(gl, idx, positions));
  }

  /**
   * @param rectangle [[x1, y1], [x2, y2]]
   * @param color Normalized RGBA
   */
  drawRect(x1: number, y1: number, x2: number, y2: number, color = [1, 1, 1, 0.2]) {
    const gl = this.gl;
    // 0 3
    // 2 1
    this.positions.set([
      x1, y1, // top left
      x2, y2, // bottom right
      x1, y2, // bottom left
      x2, y1, // top right
    ]);
    this.positionBuffer.update(this.positions);

    this.program.uniforms.scol.data = color;
    this.program.uniforms.camera.data = this.camera.projectionMatrix;
    this.jigGl.glx.using(this.program, drawer => drawer.drawElements(gl.TRIANGLES, 6))
  }
}
