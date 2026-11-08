import { game } from "$room";
import type { vector2 } from "../Vector2";
import { Vector2 } from "../Vector2";
import { canvaselem } from "./ui-elements";

enum SHAPE { line, rect, cross }

type Cross = {
    shape: SHAPE.cross;
    x: number;
    y: number;
    size: number;
    color?: string;
    text?: string;
};
type Line = {
    shape: SHAPE.line;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color?: string;
    //text?: string;
};
type Rect = {
    shape: SHAPE.rect;
    x: number;
    y: number;
    w: number;
    h: number;
    color?: string;
    text?: string;
};

export function line(start: vector2, end: vector2, color?: string): void;
export function line(startX: number, startY: number, endX: number, endY: number, color?: string): void;
export function line(a: number | vector2, b: number | vector2, c?: number | string, d?: number | string, e?: string): void {
    const { shapes } = DebugCanvas.singleton;
    if (typeof a === "number") {
        shapes.push({ shape: SHAPE.line, startX: a, startY: <number>b, endX: <number>c, endY: <number>d, color: e });
    } else {
        shapes.push({ shape: SHAPE.line, startX: a.x, startY: a.y, endX: (b as vector2).x, endY: (b as vector2).y, color: c as string });
    }
}
export function rectangle(start: vector2, end: vector2, color?: string, text?: string) {
    const { shapes } = DebugCanvas.singleton;
    shapes.push({ shape: SHAPE.rect, x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y, color, text });
}
export function rectangle2(start: vector2, size: vector2, color?: string, text?: string) {
    rectangle(start, Vector2.add(start, size), color, text);
}
export function cross(pos: vector2, size: number, color?: string, text?: string) {
    const { shapes } = DebugCanvas.singleton;
    shapes.push({ shape: SHAPE.cross, x: pos.x, y: pos.y, size, color, text });
}
export function clear() {
    const { ctx, canvas, shapes } = DebugCanvas.singleton;
    shapes.length = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}


class DebugCanvas {
    private static _instance: DebugCanvas;
    static get singleton() {
        return DebugCanvas._instance ??= new DebugCanvas(canvaselem);
    }
    shapes: (Cross | Line | Rect)[] = [];
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    constructor(insertAfter: HTMLElement) {
        console.info("Debug canvas created.");
        this.canvas = document.createElement("canvas");
        insertAfter.insertAdjacentElement("afterend", this.canvas);
        this.canvas.id = "debugCanvas";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.position = "absolute";
        this.canvas.style.pointerEvents = "none";
        this.ctx = this.canvas.getContext("2d")!;
        this.applyStyle();
        addEventListener("resize", this.applyStyle.bind(this));
        requestAnimationFrame(this.render.bind(this));
        DebugCanvas._instance = this;
    }

    private applyStyle() {
        this.canvas.width = innerWidth;
        this.canvas.height = innerHeight;
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.lineWidth = 3;
        this.ctx.font = "16px monospace";
    }

    render(timeStamp: number) {
        const { view } = game;

        const ctx = this.ctx, canvas = this.canvas, shapes = this.shapes;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const shape of shapes) {
            switch (shape.shape) {
                case SHAPE.line:
                    {
                        const x0 = view.scale * (view.x + shape.startX);
                        const y0 = view.scale * (view.y + shape.startY);
                        const x1 = view.scale * (view.x + shape.endX);
                        const y1 = view.scale * (view.y + shape.endY);
                        if (shape.color) {
                            ctx.strokeStyle = shape.color;
                        } else {
                            const style = this.ctx.createLinearGradient(x0, y0, x1, y1);
                            style.addColorStop(0, "#f00");
                            style.addColorStop(0.5, "#ff0");
                            style.addColorStop(1, "#0f0");
                            ctx.strokeStyle = style;
                        }
                        ctx.beginPath();
                        ctx.moveTo(x0, y0);
                        ctx.lineTo(x1, y1);
                        ctx.stroke();
                    }
                    break;
                case SHAPE.rect:
                    {
                        const x = view.scale * (view.x + shape.x);
                        const y = view.scale * (view.y + shape.y);
                        const w = view.scale * shape.w;
                        const h = view.scale * shape.h;
                        const { color } = shape;
                        if (color) {
                            ctx.strokeStyle = color;
                            ctx.fillStyle = color;
                        } else {
                            const style = this.ctx.createLinearGradient(x, y, x + w, y + h);
                            style.addColorStop(0, "#f00");
                            style.addColorStop(0.5, "#ff0");
                            style.addColorStop(1, "#0f0");
                            ctx.strokeStyle = style;
                            ctx.fillStyle = style;
                        }
                        ctx.strokeRect(x, y, w, h);

                        if (shape.text) {
                            ctx.fillText(shape.text, x, y + h + 16);
                        }
                    }
                    break;
                case SHAPE.cross:
                    {
                        const x = view.scale * (view.x + shape.x);
                        const y = view.scale * (view.y + shape.y);
                        const size = (view.scale * shape.size) / 2;
                        const { color } = shape;
                        if (color) {
                            ctx.strokeStyle = color;
                            ctx.fillStyle = color;
                        } else {
                            const style = this.ctx.createRadialGradient(x, y, 0, x, y, size);
                            style.addColorStop(0, "#f00");
                            style.addColorStop(0.5, "#ff0");
                            style.addColorStop(1, "#0f0");
                            ctx.strokeStyle = style;
                            ctx.fillStyle = style;
                        }
                        ctx.beginPath();
                        ctx.moveTo(x - size, y);
                        ctx.lineTo(x + size, y);
                        ctx.moveTo(x, y - size);
                        ctx.lineTo(x, y + size);
                        ctx.stroke();

                        if (shape.text) {
                            ctx.fillText(shape.text, x + 4, y + 16);
                        }
                    }
                    break;
            }
        }
        requestAnimationFrame(this.render.bind(this));
    }
}
