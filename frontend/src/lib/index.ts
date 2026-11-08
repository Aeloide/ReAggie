// place files you want to import through the `$lib` alias in this folder.
// import jigchan from "/src/lib/assets/src/room/jiggie-anim.bin";
// import spritesheet from '/static/cake.png';

export function getAssetUrl(name: string) {
  if (name && (name.startsWith("blob:") || name.startsWith("data:") || name.startsWith("http://") || name.startsWith("https://"))) {
    return name;
  }
  return getUrl(`/assets/pictures/${name}`);
}

export function getComic(name: string) {
  return getUrl(`/assets/comics${name}`);
}

export function getReplayUrl(name: string) {
  return getUrl(`/replays/${name}`);
}

export function getUrl(url: string) {
  const baseUrl = location.origin;

  return `${baseUrl}${url}`;
}
