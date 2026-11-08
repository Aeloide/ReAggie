// Collection of document utility functions

/**
 * Creates an instance of the element for the specified tag.
 * @param tagName The name of an HTML element.
 * @param className The element's class attribute.
 * @param initializer Function to call after creating the element that takes
 * one argument consisting of the new HTML element.
 * @example createElement("div", "button", (e) => {e.id = "sendBtn"; e.color = "red";});
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className?: string,
    initializer?: (elem: HTMLElementTagNameMap[K]) => void): HTMLElementTagNameMap[K];
/**
 * Creates an instance of the element for the specified tag.
 * @param tagName The name of an HTML element.
 * @param attributes Properties to assigned to the element.
 * @param style CSS style properties to assign to the element.
 * @example createElement("div", {className: "button", id: "sendBtn"}, {color: "red"});
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    attributes?: Partial<HTMLElementTagNameMap[K]>,
    style?: Partial<CSSStyleDeclaration>): HTMLElementTagNameMap[K];
export function createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    classOrAttributes?: string | Partial<HTMLElementTagNameMap[K]> | null,
    initalizerOrStyle?: ((elem: HTMLElementTagNameMap[K]) => void) | Partial<CSSStyleDeclaration> | null): HTMLElementTagNameMap[K] {

    // Create the element for the specified tag.
    const element = document.createElement(tagName);

    // Assign the class attribute or set multiple attributes
    if (classOrAttributes) {
        if (typeof classOrAttributes == "string") {
            element.className = classOrAttributes;
        } else {
            Object.assign(element, classOrAttributes);
        }
    }

    // Call the initalizer or set the inline element style
    if (initalizerOrStyle) {
        if (typeof initalizerOrStyle == "function") {
            initalizerOrStyle?.(element);
        } else {
            Object.assign(element.style, initalizerOrStyle);
        }
    }
    return element;
}
