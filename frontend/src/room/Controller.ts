export enum Button {
    None = 0,
    Right = 1,
    Left = 2,
    Down = 4,
    Up = 8,
    LeftClick = 16,
    MiddleClick = 32,
    RightClick = 64,

    // TODO: will use for later to control a virtual pointer with the keyboard
    CRight = 128,
    CLeft = 256,
    CDown = 512,
    CUp = 1024,
};


export const keyBind = {
    'ArrowUp': Button.Up,
    'ArrowDown': Button.Down,
    'ArrowLeft': Button.Left,
    'ArrowRight': Button.Right,
    'w': Button.Up,
    'a': Button.Left,
    's': Button.Down,
    'd': Button.Right,
    0: Button.LeftClick,
    1: Button.MiddleClick,
    2: Button.RightClick
};

export class Controller {
    currentKeys = 0;
    held = 0;
    pressed = 0;
    released = 0;

    update() {
        const v = this.currentKeys;
        this.pressed = (this.held ^ v) & v; // pressed keys are the keys that were not pressed
        this.released = (this.held ^ v) & this.held; // pressed keys are the keys that were not pressed
        this.held = v;
    }
}