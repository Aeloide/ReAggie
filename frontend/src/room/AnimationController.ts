import type { AsepriteImport } from './SpriteDrawer';

type Animation = AsepriteImport['anims'][string];
export class AnimationController {
    currentFrame = 0;
    currentAnim?: Animation;
    direction = 1;
    elapsed = 0;

    onEnd?: () => void;
    get frameIndex() {
        return this.currentAnim![0] + this.currentFrame
    }

    constructor(public res: AsepriteImport, public durations = res.frame_durations) {
    }

    setAnim(n: string) {
        let anim: Animation | undefined;
        if (!(anim = this.res.anims[n]))
            throw new Error('Animation not found: ' + n);
        this.res.anims[n];
        this.currentAnim = anim;
        this.elapsed = 0;
        this.currentFrame = 0;
        this.direction = 1;
    }

    // return completion rate of the current animation, taking into account the elapsed time for the current frame
    get completion() {
        const framecount = this.currentAnim![1] - this.currentAnim![0] + 1;
        return (this.currentFrame + this.partialCompletion) / framecount;
    }

    get partialCompletion() {
        let frameduration = this.durations[this.currentAnim![0] + this.currentFrame];
        return  this.elapsed / frameduration;
    }

    update(dt: number) {
        if (!this.currentAnim) return;
        this.elapsed += dt;
        const framecount = this.currentAnim[1] - this.currentAnim[0] + 1;
        let frame = this.durations[this.currentAnim[0] + this.currentFrame];
        while (this.elapsed > frame) {
            this.currentFrame += this.direction;
            this.elapsed -= frame;
            if (this.direction > 0 && this.currentFrame < framecount)
                continue;
            if (this.direction < 0 && this.currentFrame >= 0)
                continue;
            // this won't be evaluated before an entire frame has passed, so reaching 0 means we
            // were playing back, and we're considering frame 0 as an end of animation cycle
            /*
                string constants should be merged in memory so they pass self-referential tests.
                however i wonder if v8 will reorder the self referential checks here
                instead of interleaving failed tests with string comparisons.
            */
            switch (this.currentAnim[3]) {
                case 0: {
                    this.currentFrame = 0;
                    this.onEnd?.();
                    break;
                }
                case 2: {
                    this.direction *= -1;
                    if (this.direction < 0)
                        this.currentFrame += this.direction * 2;
                    else {
                        this.onEnd?.();
                        this.currentFrame = 0;
                    }
                }
            }
        }
    }
}