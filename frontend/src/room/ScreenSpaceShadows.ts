import { Camera2D } from "./Camera2D";
import { JigGL } from "./gpu4-renderer";
import ss_height from "./ss_height.glsl";
import ss_shadow from "./ss_shadow.glsl";
import { IndexBuffer, TTexture, VertexBuffer, VertexBufferAssembly } from "safe-gl";

export class ScreenSpaceShadows {
    private readonly gl: WebGL2RenderingContext;
    private heightFbo: WebGLFramebuffer | null = null;
    private heightTex: TTexture<"R32F", any, any>;

    private heightShader: any;
    private shadowShader: any;
    private quadVao: VertexBufferAssembly<any, any>;

    private depthRb: WebGLRenderbuffer | null = null;
    private currentWidth: number = 1;
    private currentHeight: number = 1;

    constructor(private jgl: JigGL) {
        this.gl = this.jgl.gl;
        // Required for rendering to R32F textures
        if (!this.gl.getExtension("EXT_color_buffer_float")) {
            console.error("EXT_color_buffer_float not supported! Shadows may fail.");
        }

        this.heightShader = new (ss_height as any)(jgl.glx);
        this.shadowShader = new (ss_shadow as any)(jgl.glx);

        // Initial small texture, will resize
        this.heightTex = this.jgl.glx.createTexture(["R32F", "RED", "FLOAT"], [1, 1], undefined, {
            TEXTURE_WRAP_S: 'CLAMP_TO_EDGE',
            TEXTURE_WRAP_T: 'CLAMP_TO_EDGE',
            TEXTURE_MIN_FILTER: 'NEAREST',
            TEXTURE_MAG_FILTER: 'NEAREST'
        });
        this.initFbo();

        // Quad for shadow pass
        const quadPos = new VertexBuffer(this.gl, "STATIC_DRAW", ["position", "vec2"]);
        quadPos.set(new Float32Array([-1, -1, 3, -1, -1, 3]));
        const quadIdx = new IndexBuffer(this.gl, "STATIC_DRAW", "UNSIGNED_SHORT");
        quadIdx.set(new Uint16Array([0, 1, 2]));
        this.quadVao = new VertexBufferAssembly(this.gl, quadIdx, quadPos);
        this.shadowShader.setAssembly(this.quadVao);
    }

    private initFbo() {
        if (this.heightFbo) this.gl.deleteFramebuffer(this.heightFbo);
        if (this.depthRb) this.gl.deleteRenderbuffer(this.depthRb);

        this.heightFbo = this.gl.createFramebuffer();
        this.depthRb = this.gl.createRenderbuffer();

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.heightFbo);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.heightTex.tex, 0);

        // Initial init of RB (will be resized immediately in prepare usually)
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthRb);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, 1, 1);
        this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, this.depthRb);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    private resize(width: number, height: number) {
        if (this.currentWidth !== width || this.currentHeight !== height) {
            this.currentWidth = width;
            this.currentHeight = height;

            // Resize Texture (User Hack Fix)
            (this.heightTex.arg as any).width = width;
            (this.heightTex.arg as any).height = height;
            this.heightTex.realloc(null, {
                TEXTURE_WRAP_S: 'CLAMP_TO_EDGE',
                TEXTURE_WRAP_T: 'CLAMP_TO_EDGE',
                TEXTURE_MIN_FILTER: 'NEAREST',
                TEXTURE_MAG_FILTER: 'NEAREST'
            });

            // Resize Depth Buffer
            this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthRb);
            this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, width, height);

            // Re-attach to FBO
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.heightFbo);
            this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.heightTex.tex, 0);
            this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, this.depthRb);

            // Do NOT unbind here, we allow the caller (prepare) to manage binding state
        }
    }

    /**
     * Renders the Height Map used for shadow calculation.
     * @param width Screen width
     * @param height Screen height
     * @param indexCount Total number of indices to draw
     * @param puzzleState Data texture
     * @param camera Camera
     * @param pieceVao The geometry assembly containing all pieces
     */
    prepare(width: number, height: number, indexCount: number, puzzleState: TTexture<"RGBA32F", any, any>, camera: Camera2D, pieceVao: VertexBufferAssembly<any, any>) {
        const gl = this.gl;
        const currentFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const currentViewport = gl.getParameter(gl.VIEWPORT);

        // Ensure resources are sized correctly
        this.resize(width, height);

        // 1. Render Height Map
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.heightFbo);
        gl.viewport(0, 0, width, height);

        // Disable blending for height write - strictly overwrite
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        // Clear Depth too!
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.heightShader.bindings.puzzleState.texture = puzzleState;
        this.heightShader.uniforms.camera.data = camera.projectionMatrix;
        this.heightShader.setAssembly(pieceVao);

        this.jgl.glx.using(this.heightShader, (drawer: any) => {
            drawer.drawElements(gl.TRIANGLES, indexCount);
        });

        // Restore State
        gl.bindFramebuffer(gl.FRAMEBUFFER, currentFbo);
        gl.viewport(currentViewport[0], currentViewport[1], currentViewport[2], currentViewport[3]);
    }

    /**
     * Draws the calculated shadow overlay onto the current framebuffer.
     */
    draw(width: number, height: number, scale: number, totalPieces: number, options: { x: number, y: number, spread: number } | null, strength: number = 0.5) {
        const gl = this.gl;

        gl.enable(gl.BLEND);
        // Multiplicative blending: Dest * (1-alpha)
        gl.blendFunc(gl.DST_COLOR, gl.ZERO);

        gl.disable(gl.DEPTH_TEST);

        // STENCIL: Mask out areas where Selection Outlines (Ref 1) were drawn
        gl.enable(gl.STENCIL_TEST);
        gl.stencilMask(0x00); // Read only
        gl.stencilFunc(gl.NOTEQUAL, 1, 0xFF);

        this.shadowShader.bindings.uHeightMap.texture = this.heightTex;
        this.shadowShader.uniforms.uResolution.data = [width, height];
        // Offset determines DIRECTION and DISTANCE of the light source.
        let pxOffsetX = 0;
        let pxOffsetY = 0;
        let pxRadius = 32.0 * scale;

        if (options) {
            // Gizmo x/y are normalized (-1 to 1). Scale generously for effect.
            const sensitivity = 20.0;
            pxOffsetX = options.x * sensitivity * scale;
            pxOffsetY = -options.y * sensitivity * scale;
            pxRadius = options.spread * 8.0 * scale;
        }

        this.shadowShader.uniforms.uShadowOffset.data = [pxOffsetX, pxOffsetY];

        // Radius determines SOFTNESS/SPREAD.
        this.shadowShader.uniforms.uRadius.data = pxRadius;

        this.shadowShader.uniforms.uTotalPieces.data = totalPieces;
        this.shadowShader.uniforms.uStrength.data = strength;

        this.jgl.glx.using(this.shadowShader, (drawer) => {
            drawer.drawElements(gl.TRIANGLES, 3);
        });

        gl.enable(gl.DEPTH_TEST); // Restore
        gl.disable(gl.BLEND);
        gl.disable(gl.STENCIL_TEST);
        gl.stencilMask(0xFF);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    destroy() {
        // Rely on JigGL destructor for texture
        this.gl.deleteFramebuffer(this.heightFbo);
        if (this.depthRb) this.gl.deleteRenderbuffer(this.depthRb);
    }
}

