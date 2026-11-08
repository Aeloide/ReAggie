import { dragMove, resetView, canRectselect, releaseHeldGroups, limitZoom, Alignment, canMultiselect, type GameGroup } from "./game";
import { setFirstTextureLoadFinished, setZ } from "./render";
import { initStillPending } from "./render";
import { fullTimeFormat } from "./ui-elements";
import { game } from "$room";
import * as arrangePieces from "./arrangePieces";
import { chatLog, settings } from "$lib/room/stores";
import { getDistance2d } from "./game-actions";
import { Button, keyBind } from "./Controller";

let viewScaleStart = 0;
let allowPinchZoom = true;
let touch1Id = -1;
let touch2Id = -1;
let touch1X = 0;
let touch1Y = 0;
let ge = false;
let deselectedAnyGroup = false;
let rightClickInitiatedInCanvas = false;

document.addEventListener("visibilitychange", () => {
    game?.connection?.setVisibility();
    if (document.visibilityState === "visible")
        fullTimeFormat();
});

export function addClickHandlers(eventTarget: EventTarget, callback: (evt: MouseEvent | TouchEvent) => void) {
    attachEvents(eventTarget, "click", callback);
}

export function attachEvents<K extends keyof WindowEventMap>(eventTarget: EventTarget, types: K | K[], callback: (evt: WindowEventMap[K]) => void, passive = false) {
    if ("string" == typeof types) {
        eventTarget.addEventListener(types, callback as any, {
            passive: passive
        });
        return [[types], callback] as [string[], any];
    } else {
        types.map((t => eventTarget.addEventListener(t, callback as any, {
            passive: passive
        })));
        return [types, callback] as [string[], any];
    }
}

let clearStack: ReturnType<typeof attachEvents>[] = [];
let timeFormatInt: any;
export function attachWindowsEvents() {
    clearStack.push(attachEvents(window, ["mousemove", "touchmove"], e => {
        if ('touches' in e) {
            const touch1 = getTouchById(e.touches, touch1Id);
            const touch2 = getTouchById(e.touches, touch2Id);
            if (game.view.isPanning) {
                if (allowPinchZoom) {
                    if (touch2 && touch1) {
                        const
                            x1 = (game.view.panStartPosX + touch1X) / 2,
                            y1 = (game.view.panStartPosY + touch1Y) / 2;
                        const dist1 = getDistance2d(game.view.panStartPosX, game.view.panStartPosY, touch1X, touch1Y);
                        const
                            x2 = (touch1.pageX + touch2.pageX) / 2,
                            y2 = (touch1.pageY + touch2.pageY) / 2;

                        const dist2 = getDistance2d(touch1.pageX, touch1.pageY, touch2.pageX, touch2.pageY);
                        const scale = limitZoom(viewScaleStart * (dist2 / dist1));
                        game.actions.setViewPos(
                            game.view.prePanViewX + (x2 / scale - x1 / viewScaleStart),
                            game.view.prePanViewY + (y2 / scale - y1 / viewScaleStart),
                            scale
                        );
                        return;
                    }
                    if (touch1) {
                        const xOffset = (touch1.pageX - game.view.panStartPosX) / game.view.scale;
                        const yOffset = (touch1.pageY - game.view.panStartPosY) / game.view.scale;
                        game.actions.setViewPos(game.view.prePanViewX + xOffset, game.view.prePanViewY + yOffset, game.view.scale);
                    }
                    return;
                }
                if (touch2) {
                    const xOffset = (touch2.pageX - game.view.panStartPosX) / game.view.scale;
                    const yOffset = (touch2.pageY - game.view.panStartPosY) / game.view.scale;
                    game.actions.setViewPos(game.view.prePanViewX + xOffset, game.view.prePanViewY + yOffset, game.view.scale);
                }
                return;
            }
            if (touch1) {
                game.view.pageClickX = Math.max(0, touch1.pageX);
                game.view.pageClickY = Math.max(0, touch1.pageY);
                dragMove(game.view.pageClickX, game.view.pageClickY, true);
            }
        } else {
            game.view.pageClickX = e.pageX;
            game.view.pageClickY = e.pageY;
            dragMove(game.view.pageClickX, game.view.pageClickY);
        };
    }));

    clearStack.push(attachEvents(window, "contextmenu", e => {
        if (rightClickInitiatedInCanvas) {
            e.preventDefault();
        }
        rightClickInitiatedInCanvas = false;
    }));

    clearStack.push(attachEvents(window, ["mouseup", "touchend"], e => {
        //e.preventDefault();
        if ('touches' in e) {
            let touch1: number | Touch | undefined = getTouchById(e.touches, touch1Id);
            let touch2: number | Touch | undefined = getTouchById(e.touches, touch2Id);
            if ((game.view.isBoxSelecting || game.view.pickedGroups.length) && !touch1) {
                if (game.rules.canRotate()) {
                    const { pageX, pageY } = e.changedTouches[0];
                    const x = pageX / game.view.scale - game.view.x;
                    const y = pageY / game.view.scale - game.view.y;

                    const group = tryGetGroupAt(x, y);
                    if (group) {
                        const dist = getDistance2d(pageX, pageY, game.view.canvasClickX, game.view.canvasClickY);
                        const MIN_TOUCH_DIST = 5;
                        if (dist < MIN_TOUCH_DIST) {
                            let groups: GameGroup[] = [];
                            if (game.view.pickedGroups.length && !deselectedAnyGroup) {
                                groups = game.view.pickedGroups;
                            } else if (group && group.selected) {
                                groups = game.state.groups.filter(e => e.selected);
                            } else if (group && !deselectedAnyGroup) {
                                groups = [group];
                            }
                            if (groups && groups.length) {
                                game.actions.turn(groups, true);
                            }
                        }
                    }
                }

                releaseHeldGroups();
                game.actions.boxSelect(e.shiftKey, game.view.selection);
                touch1Id = -1;
            }
            if (game.view.isPanning) {
                game.view.panViewStop();
                if (touch2 && !touch1) {
                    game.view.panViewStart(touch2.pageX, touch2.pageY);
                    touch1Id = touch2Id;
                    touch2Id = -1;
                }
                if (!touch2 && touch1 && allowPinchZoom) {
                    game.view.panViewStart(touch1.pageX, touch1.pageY);
                }
                allowPinchZoom = true;
            }
        } else {
            if (e.buttons & 1)
                game.state.controller.currentKeys &= ~keyBind[0];
            if (e.buttons & 2)
                game.state.controller.currentKeys &= ~keyBind[2];
            if (e.buttons & 4)
                game.state.controller.currentKeys &= ~keyBind[1];

            let groups;
            const mButton = e.button;
            let isClick = false;
            let turnClockwise = false;

            if (!e.ctrlKey && !e.shiftKey) {
                if (0 !== mButton || ge || "click" === settings.snapshot().piecePickMode || e.pageX !== game.view.canvasClickX || e.pageY !== game.view.canvasClickY) {
                    // drag motion
                    if (2 === mButton && e.pageX === game.view.panStartPosX && e.pageY === game.view.panStartPosY) {
                        isClick = true;
                        turnClockwise = true;
                        ge = true;
                    }
                } else {
                    isClick = true;
                }
            }
            const x = e.pageX / game.view.scale - game.view.x;
            const y = e.pageY / game.view.scale - game.view.y;
            const group = tryGetGroupAt(x, y);
            if (isClick) {
                if (game.view.pickedGroups.length && !deselectedAnyGroup) {
                    groups = game.view.pickedGroups;
                } else if (group && group.selected) {
                    groups = game.state.groups.filter(e => e.selected);
                } else if (group && !deselectedAnyGroup) {
                    groups = [group];
                }
                if (groups && groups.length) {
                    if (game.roomdef.flipping && e.altKey)
                        game.actions.flip(groups);
                    else game.actions.turn(groups, turnClockwise);
                }
            }

            if (0 === mButton) {
                if ("click" !== settings.snapshot().piecePickMode) {
                    releaseHeldGroups();
                } else {
                    game.view.clearEdgePan();
                }
                game.actions.boxSelect(e.shiftKey, game.view.selection);
                if (Date.now() - lastClickTime < maxDoubleClickDelayMs) {
                    const group = tryGetGroupAt(x, y, false, true);
                    if (group && group.user) {
                        game.connection.forceDrop([group]);
                    }
                }
            } else if (1 === mButton || 2 === mButton) {
                game.view.panViewStop();
            }
            if (game.view.currentMouseEvent?.end) {
                game.view.currentMouseEvent.end();
                delete game.view.currentMouseEvent;
            }

        }
        setFirstTextureLoadFinished(true);
        deselectedAnyGroup = false;
        lastClickTime = Date.now();
    }));

    clearStack.push(attachEvents(window, "blur", (function () {
        releaseHeldGroups();
        game.view.stopBoxSelection();
        game.view.panViewStop();
    })));

    clearStack.push(attachEvents(window, "resize", (function () {
        game.view.updateRoomView();
        // setTimeout((() => chatLog.scrollBottom = 0));
    })));

    let lastSpace = Date.now();
    let isSmashing = false;
    clearStack.push(attachEvents(window, "keyup", t => {
        if (game.connection.isConnected && !initStillPending && (!t.target || !/^(input|textarea|select|button)$/i.test((t.target as HTMLElement).tagName))) {
            if (t.code == "Space" && !t.repeat && !t.shiftKey && !t.ctrlKey) {
                lastSpace = Date.now();
            }
        }
    }));

    clearStack.push(attachEvents(window, "keyup", t => {
        if (t.key in keyBind)
            game.state.controller.currentKeys &= ~keyBind[t.key as keyof typeof keyBind];
    }));

    clearStack.push(attachEvents(window, "keydown", t => {
        if (t.key in keyBind)
            game.state.controller.currentKeys |= keyBind[t.key as keyof typeof keyBind];
    }));

    clearStack.push(attachEvents(window, "keydown", t => {
        if (game.connection.isConnected && !initStillPending && (!t.target || !/^(input|textarea|select|button)$/i.test((t.target as HTMLElement).tagName))) {
            if (t.code == "Space") {
                if (game.view.pickedGroups.length || game.view.isBoxSelecting) {
                    return;
                }
                const selection = game.state.groups.filter(e => e.selected);
                if (!selection.length) {
                    return;
                }
                if (t.target == document.body) {
                    t.preventDefault(); // Prevents chat scroll
                }

                if (t.shiftKey) {
                    arrangePieces.pack(selection);
                } else {
                    const current = Date.now();
                    if (!t.repeat)
                        isSmashing = (current - lastSpace) < maxDoubleClickDelayMs;
                    if (isSmashing) {
                        arrangePieces.spread(selection);
                        lastSpace = current;
                    } else
                        arrangePieces.order(selection);
                }
                setFirstTextureLoadFinished(setZ(true));
            }
            else if (!t.ctrlKey && !t.metaKey) switch (t.keyCode) {
                case 36: // $ //Home key
                    resetView();
                    break;
                case 35: // # //End Key
                    // compute the groups bounding box
                    for (var m = 1e6, x = 0, w = 1e6, y = 0, T = 0; T < game.state.groups.length; T++) {
                        let E = game.state.groups[T];
                        m = Math.min(m, E.x - E.w / 2);
                        x = Math.max(x, E.x + E.w / 2);
                        w = Math.min(w, E.y - E.h / 2);
                        y = Math.max(y, E.y + E.h / 2);
                    }
                    // set the zoom in a way that includes all groups
                    let R = x - m,
                        C = y - w,
                        k = limitZoom(.9 * Math.min(innerWidth / R, innerHeight / C));
                    game.actions.setViewPos(-(m + x) / 2 + innerWidth / k / 2,
                        -(w + y) / 2 + innerHeight / k / 2, k);
                    break;
                case 46: // . //delete
                    chatLog.clear();
                    break;
                case 65: // A
                    t.shiftKey && game.actions.alignCamera(Alignment.Left);
                    break;
                case 67: // C
                    t.shiftKey && game.actions.alignCamera(Alignment.BottomRight);
                    break;
                case 68: // D
                    t.shiftKey && game.actions.alignCamera(Alignment.Right);
                    break;
                case 69: // E
                    t.shiftKey && game.actions.alignCamera(Alignment.TopRight);
                    break;
                case 70: // F
                case 71: // G
                case 37: // %
                case 39: // '
                    if (game.roomdef!.rotation) {
                        var M = game.view.pickedGroups;
                        if (M.length || (M = game.state.groups.filter((function (e) {
                            return e.selected;
                        }))), !M.length) break;
                        game.actions.turn(M, 71 === t.keyCode || 39 === t.keyCode);
                    }
                    break;
                case 81: // Q
                    t.shiftKey && game.actions.alignCamera(Alignment.TopLeft);
                    break;
                case 83: // S
                    t.shiftKey && game.actions.alignCamera(Alignment.Center);
                    break;
                case 87: // W
                    t.shiftKey && game.actions.alignCamera(Alignment.Top);
                    break;
                case 88: // X
                    t.shiftKey && game.actions.alignCamera(Alignment.Bottom);
                    break;
                case 90: // Z
                    t.shiftKey && game.actions.alignCamera(Alignment.BottomLeft);
                    break;
                case 107: //k
                case 187:
                    setRelativeViewPos(limitZoom(1.2 * game.view.scale),
                        innerWidth / 2, innerHeight / 2);
                    break;
                case 109: //m
                case 189:
                    setRelativeViewPos(limitZoom(.8 * game.view.scale),
                        innerWidth / 2, innerHeight / 2);
            }
            if ((t.ctrlKey || t.metaKey) && 90 === t.keyCode) { //Ctrl+Z
                game.actions.revertGroups();
                return;
            }
        }
    }));

    fullTimeFormat();
    timeFormatInt = setInterval(fullTimeFormat, 1e3);
}

export function clearWindowsEvents() {
    clearStack.forEach(e => {
        for (let ev of e[0])
            removeEventListener(ev, e[1]);
    });

    clearInterval(timeFormatInt);
}

export const handleCanvasPressEvent = (e: MouseEvent | TouchEvent) => {
    // e.preventDefault();
    (e.target as HTMLCanvasElement).focus();

    if (!game.connection.isConnected || initStillPending) return;

    const isTouch = 'touches' in e;
    const mButton = isTouch ? 0 : e.button;
    if (isTouch && e.touches.length > 1) {
        if (game.view.pickedGroups.length) {
            const touch2 = getOtherTouch(e.touches, touch1Id);
            if (!touch2) return;
            allowPinchZoom = false;
            touch2Id = touch2.identifier;
            game.view.panViewStart(touch2.pageX, touch2.pageY);
            e.preventDefault();
            return;
        }

        viewScaleStart = game.view.scale;
        touch1Id = e.touches[0].identifier;
        touch2Id = e.touches[1].identifier;

        // TODO: refactor
        game.view.stopBoxSelection();
        game.view.canvasClickX = touch1X = e.touches[0].pageX;
        game.view.canvasClickY = touch1Y = e.touches[0].pageY;
        game.view.panViewStart(e.touches[1].pageX, e.touches[1].pageY);
        e.preventDefault();

        return;
    }
    if (0 === mButton) {
        game.state.controller.currentKeys |= Button.LeftClick;
        if (!isTouch && "click" === settings.snapshot().piecePickMode && game.view.pickedGroups.length) {
            releaseHeldGroups();
            e.preventDefault();
            return;
        }
        if (isTouch) {
            const touch2 = getOtherTouch(e.touches, touch2Id);
            if (!touch2) return;
            touch1Id = touch2.identifier;
            game.view.canvasClickX = touch2.pageX;
            game.view.canvasClickY = touch2.pageY;
        } else {
            game.view.canvasClickX = e.pageX;
            game.view.canvasClickY = e.pageY;
        }
        // Anti-clockwise rotation is prevented after rightclicking once
        // if this line is commented out.
        // I can't find a use case for this variable.
        ge = false;

        pieceWasFound = false;
        deselectedAnyGroup = false;

        const gameX = game.view.canvasClickX / game.view.scale - game.view.x;
        const gameY = game.view.canvasClickY / game.view.scale - game.view.y;

        game.onNextClick?.(gameX, gameY);

        if (e instanceof MouseEvent) {
            for (let entm of game.entities) {
                const mw = entm.wants(e, () => {
                    delete game.view.currentMouseEvent;
                });
                if (mw) {
                    game.view.currentMouseEvent = mw;
                    e.preventDefault();
                    return;
                }
            }
        }

        const pickedGroup = tryGetGroupAt(gameX, gameY, e.ctrlKey || e.metaKey);

        // for (const rec of game.records) {
        //     if (getDistance2d(gameX, gameY, ...rec.pos) < 32) {
        //         game.connection.solveRecord(rec.id);
        //     }
        // }

        if (pickedGroup) {
            if (e.ctrlKey || e.metaKey) return void game.actions.toggleLock(pickedGroup);
            if (e.shiftKey) {
                if (canMultiselect()) {
                    return void game.actions.toggleSelect(pickedGroup);
                }
            }

            deselectedAnyGroup = false;
            if (pickedGroup.locked) return;
            if (game.rules.sticky) {
                if (game.view.stickied.size >= 2 && !game.view.stickied.has(pickedGroup)) return;
            }

            deselectedAnyGroup = game.actions.pickGroup(pickedGroup);
            e.preventDefault();
            setFirstTextureLoadFinished(true);
            return;
        }
        if (isTouch) {
            const isDobuleTouch = Date.now() - lastTouchTime < maxDoubleClickDelayMs;
            lastTouchTime = Date.now();
            if (!isDobuleTouch) {
                game.view.panViewStart(game.view.canvasClickX, game.view.canvasClickY);
                e.preventDefault();
                return;
            }
        }
        if (canRectselect()) {
            if (pieceWasFound) return;
            game.view.beginBoxSelection(gameX, gameY);
            e.preventDefault();
            return;
        }
        if (!e.shiftKey) {
            game.actions.deselectSelected();
        }
        return;
    }
    if ((1 === mButton || 2 === mButton) && !isTouch) {
        if (mButton == 2) {
            game.state.controller.currentKeys |= Button.RightClick;
            rightClickInitiatedInCanvas = true;
        } else {
            game.state.controller.currentKeys |= Button.MiddleClick;
        }
        game.view.panViewStart(e.pageX, e.pageY);
        e.preventDefault();
    }
};

export const handleCanvasWheelEvent = (e: WheelEvent) => {
    if (e.deltaY) {
        //was originally var t = e.touches ? e.touches[0] : e, but doesn't make sense as a touch event doesn't have a deltaY
        let t = e,
            r = t.pageX,
            n = t.pageY,
            a = e.deltaY > 0 ? .9 : 1.1;
        setRelativeViewPos(limitZoom(game.view.scale * a), r, n);
    }
};

function getOtherTouch(touches: TouchList, ignoreId: number) {
    for (const touch of touches)
        if (touch.identifier !== ignoreId)
            return touch;
}

function getTouchById(touches: TouchList, touchId: number) {
    for (const touch of touches)
        if (touch.identifier === touchId)
            return touch;
}

let pieceWasFound = false;

/**
 * Get the topmost group at the chosen coordinates.
 * Sets {@link pieceWasFound} if an valid piece was found regardless of {@link includeHeld}.
 * @param gameX World-space X.
 * @param gameY World-space Y.
 * @param includeLocked Return locked pieces.
 * @param includeHeld Return held pieces.
 * @returns A group if one was found or undefined if not.
 */
export function tryGetGroupAt(gameX: number, gameY: number, includeLocked?: boolean, includeHeld?: boolean) {
    const renderer = game.renderer!;
    return game.actions.tryGetGroupAt(gameX, gameY, renderer, includeLocked, includeHeld, () => pieceWasFound = true);
}

let lastClickTime = 0;
let lastTouchTime = 0;
const maxDoubleClickDelayMs = 300;

/**
 * Move the view in relative screen-space coordinates.
 * @param {number} scale Zoom level. 1 = 100%
 * @param {number} x Relative right pan.
 * @param {number} y Relative down pan.
 */
function setRelativeViewPos(scale: number, x: number, y: number) {
    game.actions.setViewPos(
        game.view.x + (x / scale - x / game.view.scale),
        game.view.y + (y / scale - y / game.view.scale),
        scale);
}
