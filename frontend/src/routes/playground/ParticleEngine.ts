export class ParticleEngine {
    constructor(private gl: WebGL2RenderingContext) {

    }

    effectSpawner<T>(ctor: { new(): ParticleEffect<T> }) {
        new ctor;
    }
}

// defines a force field that affects particles
type ParticleField = {

}

type ParticleGeometry = {

}

type ParticleMaterial = {
    texture: WebGLTexture | WebGLTexture[],
    shaderParams: { // globals
        uvx: number;
        uvy: number;
    },
    blendingMode: 'additive' | 'subtractive' | 'multiply',
}

type ParticleBehavior = {
    shape: 'quad' | 'billboard' | 'stripe';
    material: ParticleMaterial;
}

type BaseParticleEmitter = {
    maxParticles: number;
    emissionRate: number;
    lifeTime: number;
    activeParticles: number;
}

type ParticleEmitter<T> = BaseParticleEmitter & {
    px: number;
    py: number;
    pz: number;
    emitParticle(inputParticle: T): void;
}

type PointEmitter = ParticleEmitter<[x: number, y: number, z: number, angle: number, size: number]> & {

}

type PropertyDriver = {
    evaluate(prev: number, ts: number, dt: number): number;
}

const BasicPointEmitter: PointEmitter = {
    lifeTime: 100,
    maxParticles: 100,
    activeParticles: 0,
    px: 0,
    py: 0,
    pz: 0,
    emissionRate: Number.POSITIVE_INFINITY, // emit as many particles as possible as soon as possible
    emitParticle(inputParticle) {
        while (inputParticle.length < 5) {
            inputParticle.push(0);
        }
        // position
        inputParticle[0] = 0;
        inputParticle[1] = 0;
        inputParticle[2] = 0;
        // angle
        inputParticle[3] = Math.random() * Math.PI * 2;
        // size
        inputParticle[4] = 5;
    },
}

export type ParticleEffect<T> = {
    activeParticleCount: number;
    // pool of particle data, partitionned by activeParticleCount 
    pool: T[];
    poolprops: { remainingLife: number }[];
    fields: ParticleField[];
    geometry: ParticleGeometry;
    particleTypes: ParticleBehavior[];
    emitter: ParticleEmitter<T>;

    emitter_drivers: Record<string, number | PropertyDriver>;
    particle_drivers: (number | PropertyDriver)[];

}

function getSetter(obj: any, path: string) {
    const components = path.split('.');
    components.slice(0, -1).forEach(c => obj = obj[c]);
    const last = components.at(-1)!;
    return {
        get: () => obj[last],
        set: (v: any) => obj[last] = v
    };
}

function updateParticleEffect<T extends number[]>(pe: ParticleEffect<T>, ts: number, dt: number) {
    // update emitter properties
    for (let [propertypath, driver] of Object.entries(pe.emitter_drivers)) {
        const { get, set } = getSetter(pe, propertypath); // TODO: cache this
        if (typeof driver == "number") {
            if (get() != driver)
                set(driver);
        } else
            set(driver.evaluate(get(), ts, dt));
    }

    // update emitter
    let particlesToEmit = pe.emitter.emissionRate * dt;
    while (pe.emitter.activeParticles < pe.emitter.maxParticles && particlesToEmit > 0) {
        let particledata: typeof pe.pool[number];
        if (pe.activeParticleCount >= pe.pool.length) {
            particledata = [0] as T;
            pe.pool.push(particledata);
        } else {
            particledata = pe.pool[pe.activeParticleCount];
            pe.poolprops[pe.activeParticleCount].remainingLife = pe.emitter.lifeTime;
        }

        pe.emitter.emitParticle(particledata);

        pe.activeParticleCount += 1;
        particlesToEmit -= 1;
    }

    // update particles
    for (let i = 0; i < pe.particle_drivers.length; ++i) {
        const driver = pe.particle_drivers[i];
        for (let j = 0; j < pe.activeParticleCount; ++j) {
            if (typeof driver == "number")
                pe.pool[j][i] = driver;
            else
                pe.pool[j][i] = driver.evaluate(pe.pool[j][i], ts, dt);
        }
    }

    // TODO: upload data to GPU
}

function renderParticleEffect<T>(pe: ParticleEffect<T>) {

}
