<script lang="ts">
    import { onMount } from "svelte";
    import { rendererStore } from "$room/game";
    import { deltaTimeStore, frameTimeStore } from "$room/render";
    import LineChart from "./LineChart.svelte";

    class PerfCounter {
        readonly queue: number[];
        sum: number = 0;
        average: number = 0;
        now: number = 0;
        readonly size: number;
        constructor(size: number){
            this.queue = Array(size).fill(0);
            this.size = size;
        }
        push(value: number){
            const v = Number.isFinite(value) ? value : 0;
            this.sum += v - (this.queue.shift() || 0);
            this.queue.push(v);
            this.average = this.sum / this.size;
            this.now = v;
        }
    }

    const colors = {
        render: "#800000",
        renderer: "#808000",
        fps: "#000080"
    };

    const totalFrameTimes = new PerfCounter(120);
    const rendererFrameTimes = new PerfCounter(120);
    const frameRates = new PerfCounter(60);

    onMount(() => {
        const unsubs =[
            frameTimeStore.subscribe(ms => {
                const [render, renderer] = ms;
                totalFrameTimes.push(1000 * render);
                rendererFrameTimes.push(1000 * renderer);
                //@ts-ignore Coaxing svelte's reactivity 
                totalFrameTimes.queue = totalFrameTimes.queue;
                //@ts-ignore
                rendererFrameTimes.queue = rendererFrameTimes.queue;
            }),
            deltaTimeStore.subscribe(ms => {
                if(!ms) frameRates.push(0);
                frameRates.push(1000 / ms);
                //@ts-ignore Coaxing svelte's reactivity 
                frameRates.queue = frameRates.queue;
            }),
        ];
        return () => {
            for (const unsub of unsubs) {
                unsub();
            }
        };
    });
</script>

<div id="perfmon">
    <div id="charts">
        <LineChart
            width={200}
            scale={.05}
            gridLines={[500, 1e3, 2e3, 3e3, 4e3, ~~(1e6/144)]}
            unit=µs
            data={[totalFrameTimes.queue, rendererFrameTimes.queue]}
            average={totalFrameTimes.average}
            color={[colors.render, colors.renderer]}
        />
        <LineChart
            width={100}
            scale={1}
            gridLines={[30, 60, 144]}
            unit=fps
            data={frameRates.queue}
            average={frameRates.average}
            color={colors.fps}
        />
    </div>
    <table>
        <tr>
            <td>Framerate</td>
            <td>{Math.round(frameRates.now)}</td>
            <td>fps</td>
        </tr>
        <tr>
            <td>Renderloop</td>
            <td>{~~totalFrameTimes.average}</td>
            <td>µs</td>
        </tr>
        <tr>
            <td>{$rendererStore?.constructor.name}</td>
            <td>{~~rendererFrameTimes.average}</td>
            <td>µs</td>
        </tr>
        <tr>
            <td>Render overhead</td>
            <td>{~~(totalFrameTimes.average - rendererFrameTimes.average)}</td>
            <td>µs</td>
        </tr>
    </table>
</div>

<style>
    * {
        pointer-events: none;
    }
    #perfmon {
        position: absolute;
        left: .25em;
        bottom: .25em;
        z-index: 10;
    }
    #charts {
        display: flex;
        gap: .5em;
        align-items: flex-end;
        margin-bottom: .25em;
    }
    table {
        color: #888;
        font: normal 14px monospace;
        white-space: pre;
        /* width: 100%; */
    }
    td:nth-child(1) {
        text-align: left;
    }
    td:nth-child(2) {
        text-align: right;
        width: 4em;
    }
</style>
