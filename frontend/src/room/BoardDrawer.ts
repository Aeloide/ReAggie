import jacquardTextureUrl from "$lib/assets/board-textures/jacquard.jpg";
import leatherTextureUrl from "$lib/assets/board-textures/leather.jpg";
import leather2TextureUrl from "$lib/assets/board-textures/leather2.jpg";
import sheerTextureUrl from "$lib/assets/board-textures/sheer.jpg";
import woolTextureUrl from "$lib/assets/board-textures/wool.jpg";
import { Camera2D } from "./Camera2D";
import { JigGL } from "./gpu4-renderer";
import rectbg from "./rectbg.glsl";
import { IndexBuffer, VertexBuffer, VertexBufferAssembly } from "safe-gl";

export class BoardDrawer {
  private readonly positions = new Float32Array(4 * 2);
  texture;
  dummy;

  rectshaderinst;
  position;
  constructor(private jigGl: JigGL, private camera: Camera2D) {
    const gl = this.jigGl.gl;
    const gls = this.jigGl.glx;

    this.rectshaderinst = new rectbg(gls);
    this.position = new VertexBuffer(gl, 'STREAM_DRAW', ['position', 'vec2']);
    this.position.set(this.positions);

    let index = new IndexBuffer(gl, 'STATIC_DRAW', "UNSIGNED_SHORT");
    index.set(new Uint16Array([0, 1, 2, 0, 2, 3]));

    const input = new VertexBufferAssembly(gl, index, this.position);
    this.rectshaderinst.setAssembly(input);

    this.texture = gls.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"],
      [1, 1],
      new Uint8Array([255, 255, 255, 255])); // dummy white pixel
    this.dummy = gls.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"],
      [1, 1],
      new Uint8Array([255, 255, 255, 255])); // dummy white pixel
  }

  private getTextureUrl(textureName: string) {
    // TODO: rewrite using https://vitejs.dev/guide/assets#new-url-url-import-meta-url
    switch (textureName) {
      case "leather":
        return leatherTextureUrl;
      case "leather2":
        return leather2TextureUrl;
      case "wool":
        return woolTextureUrl;
      case "jacquard":
        return jacquardTextureUrl;
      case "sheer":
        return sheerTextureUrl;
      case "none":
      default:
        return null;
    }
  }

  setTexture(textureName: string) {
    const textureUrl = this.getTextureUrl(textureName);
    if (!textureUrl) {
      this.texture = this.dummy;
      return;
    }

    if (!this.texture) {
      this.texture = this.dummy;
      return;
    }

    const image = new Image();
    image.onload = () => {
      this.texture.realloc(image, {
        TEXTURE_WRAP_S: 'REPEAT',
        TEXTURE_WRAP_T: 'REPEAT',
        TEXTURE_MAG_FILTER: 'LINEAR',
        TEXTURE_MIN_FILTER: 'LINEAR'
      })
    };
    image.src = textureUrl;
  }

  draw(x1: number, y1: number, x2: number, y2: number, color = [1, 1, 1, 1]) {
    this.drawWithTexture(x1, y1, x2, y2, color);
  }

  private drawWithTexture(x1: number, y1: number, x2: number, y2: number, color: number[]) {
    const gl = this.jigGl.gl;

    // prettier-ignore
    this.positions.set([
      x1, y1, // Bottom-left
      x2, y1, // Bottom-right
      x2, y2, // Top-right
      x1, y2  // Top-left
    ]);

    this.position.update(this.positions);
    this.rectshaderinst.uniforms.camera.data = this.camera.projectionMatrix;
    this.rectshaderinst.uniforms.colorTint.data = color;
    this.rectshaderinst.bindings.uTexture.texture = this.texture;
    this.jigGl.glx.using(this.rectshaderinst, (drawer) => {
      drawer.drawElements(gl.TRIANGLES, 6);
    })
  }
}
