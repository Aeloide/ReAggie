import { getUrl } from "$lib";
import type { CreateRoomSubmitParams, RoomSettings } from "./types";

interface CreateRoomResponse {
  id?: string;
  secret?: string;
  error?: string;
}

interface CreateRoomResult {
  room?: { id: string; secret: string; };
  error?: string;
}

const appendBoolValue = (
  formData: FormData,
  key: string,
  val: boolean,
  trueValue: string = "yes"
) => {
  if (val) {
    formData.append(key, trueValue);
  }
};

function saneFlipping(sizes: string) {
  const ss = sizes.split(';')
  if (ss.length === 0 || ss.length % 2 !== 0)
    return false;
  for (let i = 0; i < ss.length; i += 2) {
    const a = ss[i];
    const b = ss[i + 1];
    if (a != b)
      return false;
  }
  return true;
}

export async function fetchForm(url: string, data: FormData, progress?: (e: ProgressEvent) => void) {
  const xhr = new XMLHttpRequest();

  return new Promise<Response>(function (success, failure) {
    xhr.responseType = 'blob';
    xhr.onreadystatechange = function () {
      if (xhr.readyState != 4) { // done
        return;
      }

      const response = new Response(xhr.response, {
        status: xhr.status,
        statusText: xhr.statusText
      });

      if (xhr.status >= 400) {
        failure(new Error(`Request failed (${xhr.status})`));
        return;
      }

      success(response);
    };

    xhr.addEventListener('error', () => {
      failure(new TypeError('Failed to fetch'));
    });

    if (progress) {
      xhr.upload.addEventListener('progress', progress);
    }

    xhr.open('POST', url, true);
    xhr.send(data);
  });
}

export const createRoom = async (
  params: CreateRoomSubmitParams,
  settings: RoomSettings,
  progress: (n: number) => void = () => { },
  ssprogress: (msg: string) => void = () => { }
): Promise<CreateRoomResult> => {
  const formData = new FormData();
  formData.append("name", params.name || "New room");
  formData.append("urlname", params.urlname);
  formData.append("censor", params.censor);
  formData.append("size", params.size);
  if (params.layouts) {
    formData.append("layouts", JSON.stringify(params.layouts));
  }
  formData.append("pieces", settings.pieces.toString());
  appendBoolValue(formData, "rotation", settings.rotation);
  appendBoolValue(formData, "flipping", settings.flipping && saneFlipping(params.size));
  appendBoolValue(formData, "edges", settings.edges, "separate");
  appendBoolValue(formData, "preview", settings.preview, "hide");
  appendBoolValue(formData, "votekick", settings.votekick);
  appendBoolValue(formData, "mixsets", settings.mixsets);
  appendBoolValue(formData, "juke", settings.juke);
  appendBoolValue(formData, "square", settings.square);
  appendBoolValue(formData, "scores", settings.scores);
  appendBoolValue(formData, "zigzag", settings.zigzag);
  appendBoolValue(formData, "fakeEdge", settings.fakeEdge);
  appendBoolValue(formData, "noedge", settings.noEdge);
  appendBoolValue(formData, "nomultisel", settings.nomultisel);
  appendBoolValue(formData, "nolock", settings.nolock);
  appendBoolValue(formData, "norect", settings.norect);
  appendBoolValue(formData, "nostack", settings.nostack);
  appendBoolValue(formData, "auth", settings.auth);
  appendBoolValue(formData, "sd", settings.sd);
  appendBoolValue(formData, "nsfw", settings.nsfw);
  appendBoolValue(formData, "forceanon", settings.forceanon || false);
  appendBoolValue(formData, "rotting", settings.rotting || false);
  appendBoolValue(formData, "sticky", settings.sticky || false);
  appendBoolValue(formData, "jigchan", settings.jigchan || false);
  formData.append("autism", settings.autism.toString());
  formData.append("jitter", settings.jitter.toString());
  formData.append("cornerJitter", settings.cornerJitter.toString());
  formData.append("tabsize", settings.tabSize.toString());
  formData.append("tabSize", settings.tabSize.toString());
  if (settings.token)
    formData.append("token", settings.token);

  appendBoolValue(formData, "listable", settings.listable);
  formData.append("tags", JSON.stringify(settings.tags || []));
  if (settings.listable && settings.secretkey) {
    formData.append("key", settings.secretkey);
  }

  async function doCreateRoom() {
    return (await fetchForm(getUrl("/api/create-room"), formData, ev => progress(ev.loaded / ev.total))).json();
  }

  try {
    let totalsize = 0;
    let transferred = 0;
    const intentRes = await fetch(getUrl('/api/intent' + (settings.sd ? '?sd' : '')), { cache: 'no-store' });
    if (!intentRes.ok) {
      throw new Error(`Failed to start upload (${intentRes.status})`);
    }
    const intent = (await intentRes.json()).id as string;
    for (let f of params.files || []) {
      totalsize += f.size;
    }
    if (params.thumbnail)
      totalsize += params.thumbnail.size;

    // don't bother minimizing requests here, volume is the bottleneck, not latency
    let dims = params.size.split(';');
    for (let i = 0; i < (params.files?.length || 0); ++i) {
      const f = params.files?.item(i)!;
      const formData = new FormData();
      formData.append("id", intent);
      formData.append("sizes", dims[i]);
      formData.append("files", f);
      const rep = await (await fetchForm(getUrl("/api/intent"), formData, ev => progress((transferred + ev.loaded) / totalsize))).json();
      if (!rep.ok || 'error' in rep)
        throw new Error(getErrorMessage(rep.error));
      if (rep.tracking) {
        // processing is stalled, requires verification
        const es = new EventSource("/api/track/" + rep.tracking);
        await new Promise<void>((resolve, reject) => {
          es.onerror = () => reject(new Error("Connection closed before review finished, try again later."));
          es.onmessage = ev => {
            const msg = JSON.parse(ev.data) as
              | { type: 'progress', reviews: {pending: boolean, queue: number}[] }
              | { type: 'success' }
              | {
                type: 'rejected' | 'error',
                reason: string
              };
            switch (msg.type) {
              case "progress":
                console.log(msg)
                const q = msg.reviews[0]; // files are uploaded one by one, so make this shortcut
                ssprogress(`File ${i + 1} / ${params.files?.length || 0}: ${q.queue === 0 ? 'Processing' : `Waiting In Queue ${q.queue}`}`)
                break;
              case "success": resolve(); break;
              case "rejected": // fallthrough
              case "error":
                reject(msg.reason);
            }
          }
        })
      }
      transferred += f.size;
    }

    if (params.thumbnail) {
      const tformData = new FormData();
      tformData.append("id", intent);
      tformData.append("thumb", 'true');
      tformData.append("files", params.thumbnail);
      (await fetchForm(getUrl("/api/intent"), tformData, ev => progress((transferred + ev.loaded) / totalsize))).json();
      transferred += params.thumbnail.size;
      appendBoolValue(formData, "thumbnail", true);
    }
    formData.append("intent", intent);

    const res = await doCreateRoom();
    if ('error' in res)
      throw new Error(getErrorMessage(res.error));
    return { room: { id: res.id, secret: res.secret } };
  } catch (error) {
    // enterprise ready©
    console.error(error);
    return { error: (error as Error)?.message || getErrorMessage("Network failure") };
  }
};

const getErrorMessage = (errorCode: string | undefined) => {
  if (!errorCode) {
    return "Unknown error";
  }

  switch (errorCode) {
    case "already_exists":
      return "This name is already in use...";
    case "proxytor":
      return "Proxy/VPN/Tor detected, contact me if you believe this is a mistake.";
    default:
      return "Error: " + errorCode;
  }
};
