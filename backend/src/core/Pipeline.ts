export type Awaitable<T> = T | Promise<T>;
export type StepFn<In, Out> = (input: In) => Awaitable<Out>;

export class Pipeline<Input, Current = Input, Events = {}> {
    private steps: StepFn<any, any>[];
    private listeners: Map<string, Array<(data: any) => void>> = new Map();

    private constructor(steps: StepFn<any, any>[] = []) {
        this.steps = steps;
    }

    static create<I>(): Pipeline<I, I, {}> {
        return new Pipeline<I, I, {}>();
    }

    /**
     * Adds a processing step to the pipeline.
     * The return value of the function is merged into the current context.
     * The next step will receive the intersection of the current context and the step's output.
     */
    step<Out>(fn: StepFn<Current, Out>): Pipeline<Input, Current & Out, Events> {
        return new Pipeline<Input, Current & Out, Events>([...this.steps, fn]);
    }

    /**
     * Emits an event with the current context data.
     * Listeners can be attached using the `on` method.
     */
    emit<K extends string>(event: K): Pipeline<Input, Current, Events & Record<K, Current>> {
        const emitStep: StepFn<Current, {}> = (input) => {
            return {};
        };
        (emitStep as any).__eventName = event;
        return new Pipeline<Input, Current, Events & Record<K, Current>>([...this.steps, emitStep]);
    }

    /**
     * Registers a listener for an event emitted during the pipeline execution.
     * The listener receives the data as it was at the point of emission.
     */
    on<K extends keyof Events>(event: K, listener: (data: Events[K]) => void): this {
        if (!this.listeners.has(event as string)) {
            this.listeners.set(event as string, []);
        }
        this.listeners.get(event as string)!.push(listener);
        return this;
    }

    /**
     * Executes the pipeline with the provided initial input.
     * Each step's output is merged into the accumulating context.
     */
    async execute(input: Input): Promise<Current> {
        let current: any = input;

        for (const step of this.steps) {
            const eventName = (step as any).__eventName;
            if (eventName) {
                const listeners = this.listeners.get(eventName);
                if (listeners) {
                    listeners.forEach(listener => listener(current));
                }
            }

            const result = await step(current);
            if (result && typeof result === 'object') {
                current = { ...current, ...result };
            }
        }

        return current;
    }
}
