<script lang="ts">
    import { afterUpdate, onMount } from "svelte";
    import { toRgbaNum } from "../../utils";
    export let data: number[] | number[][] = [];
    export let scale: number = 1;
    export let gridLines: number[] = [];
    export let width: number;
    export let average: number | undefined;
    export let color: string | string[] = "#ff0000";
    export let unit = "";   
    
    let bgCanvasElem: HTMLCanvasElement | undefined;
    let fgCanvasElem: HTMLCanvasElement | undefined;
    let fg: CanvasRenderingContext2D, bg: CanvasRenderingContext2D;
    
    $: if(fg && bg){
        const col = Array.isArray(color) ? color[0] : color;
        const [r,g,b,a] = toRgbaNum(col).map((c, i) => i == 3 ? c : ~~(c * 255));
        fg.strokeStyle = col;
        fg.fillStyle = `rgba(${r}, ${g}, ${b}, ${a * 0.25})`;
    }

    const height = -scaleFn(0, scale, Math.max(...gridLines)) + 10;

    onMount(() => {
        if (!fgCanvasElem || !bgCanvasElem) return;
        const canvasOptions: CanvasRenderingContext2DSettings = {
            desynchronized: true,
            willReadFrequently: false,
        };
        fg = fgCanvasElem.getContext("2d", canvasOptions)!;
        bg = bgCanvasElem.getContext("2d", canvasOptions)!;
        if(!fg || !bg) throw new Error("No drawing context for the LineChart");
        drawBackground(bg);
    });

    afterUpdate(drawForeground);

    function drawBackground(bg: CanvasRenderingContext2D){
        bg.strokeStyle = "#888";
        bg.fillStyle = "#888";
        bg.font = "normal 14px monospace";
        bg.textAlign = "left";
        bg.textBaseline = "middle";

        const padding = String(Math.max(...gridLines)).length;
        for (const line of gridLines) {
            const {width, height} = bg.canvas;
            const y = scaleFn(height, scale, line);
            const text = [("" + line).padStart(padding, " "), unit].join(" ");
            bg.beginPath();
            bg.moveTo(bg.measureText(text + " ").width, y);
            bg.lineTo(width, y);
            bg.stroke();
            bg.fillText(text, 0, y);
        }
    }

    function drawForeground() {
        if (!data.length) return;
        const canvas = fg;
        const { width, height } = fgCanvasElem!;
        canvas.clearRect(0, 0, width, height);

        const multiColor = Array.isArray(color);
        // Handle multiple data sets
        if(Array.isArray(data[0])) {
            for (let i = 0; i < data.length; i++) {
                const dataSet = data[i] as number[];
                if(multiColor){
                    fg.strokeStyle = color[i] || color[0];
                }
                drawSet(dataSet, i == 0);
            }
        } else {
            drawSet(data as number[], true);
        }
                
        if(average){
            if(multiColor) fg.strokeStyle = color[0];
            const avgH = scaleFn(height, scale, average);
            canvas.beginPath();
            canvas.moveTo(0, avgH);
            canvas.lineTo(width, avgH);
            canvas.stroke();
        }

        function drawSet(data: number[], fill: boolean = false){
            const path = new Path2D();
            const spacing = fgCanvasElem!.width / (data.length - 1) || 0;
            for (let i = 0; i < data.length; i++) {
                const d = data[i];
                path.lineTo(i * spacing, scaleFn(height, scale, d));
            }
            if(fill){
                const _fill = new Path2D(path);
                _fill.lineTo(width, height);
                _fill.lineTo(0, height);
                _fill.closePath();
        
                canvas.fill(_fill, "nonzero");
            }
            canvas.stroke(path);
        }
    }

    function scaleFn(maxHeight: number, scale: number, y: number): number {
        return maxHeight - y * scale;
    }
</script>

<div style="height: {~~height}px; width: {~~width}px">
    <canvas bind:this={bgCanvasElem} {width} {height}></canvas>
    <canvas bind:this={fgCanvasElem} {width} {height}></canvas>
</div>

<style>
    div {
        position: relative;
    }
    canvas {
        position: absolute;
        bottom: 0px;
    }
    canvas:nth-child(1) {
        background-color: #00000020;
    }
</style>
