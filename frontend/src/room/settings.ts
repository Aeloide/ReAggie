export function loadFromLocalStorage(key: string) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return;
    }
}

export function setLocalStorage(key: string, value: string | number) {
    try {
        localStorage.setItem(key, '' + value);
    } catch (e) { }
}

export function loadFloatSetting(key: string, fallback: number) {
    let f = parseFloat(loadFromLocalStorage(key)!);
    return Number.isNaN(f) ? fallback : f;
}
