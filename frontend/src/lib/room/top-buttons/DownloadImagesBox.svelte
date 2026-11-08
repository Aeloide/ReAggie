<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { getAssetUrl } from "$lib";
  import Fa from "svelte-fa";
  import { faDownload } from "@fortawesome/free-solid-svg-icons/faDownload";
  import { roomDef } from "../stores";
  import { Button } from "$lib/components/ui/button";
  import { faSpinner } from "@fortawesome/free-solid-svg-icons/faSpinner";
  import { downloadZip, type InputWithMeta, type InputWithoutMeta, type JustMeta } from "client-zip";
  import { game } from "$room";
  let isLoading = false;
  let proper = 0;
  const responseToStreamWithProgress = (response: Response, progress: (n: number) => void) => {
    const contentEncoding = response.headers.get("content-encoding");
    const contentLength = response.headers.get(contentEncoding ? "x-file-size" : "content-length");
    if (contentLength === null) {
      throw Error("Response size header unavailable");
    }

    const total = parseInt(contentLength, 10);
    let loaded = 0;

    return new ReadableStream({
        start(controller) {
          const reader = response.body!.getReader();
          read();
          async function read() {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            loaded += value.byteLength;
            progress(loaded / total);
            controller.enqueue(value);
            read();
          }
        },
      })
  };

  const downloadImages = async () => {
    isLoading = true;
    proper = 0;
    const sets = $roomDef?.sets || [];
    const responses: InputWithoutMeta[] = [];
    const files = sets.flatMap(s => [s.image, ...(s.image2 ? [s.image2] : [])]);
    for (let i = 0; i < files.length; i++) {
      const set = files[i];
      const url = getAssetUrl(set);
      const res = await fetch(url);
      responses.push({
        input: responseToStreamWithProgress(res, n => {
          proper += n / sets.length
        }),
        name: set,
        size: +res.headers.get("content-length")!,
      });
    }
    const res = downloadZip(responses);
    const kk = responses.map((r) => Number(r.size!));
    res.headers.set("content-length", "" + kk.reduce((a, b) => a + b));
    const dlTag = document.createElement("a");
    dlTag.download = `${game.roomName}.zip`;

    proper = 0;
    const blob = await new Response(responseToStreamWithProgress(res, (n) => {
      proper = n;
    })).blob();
    dlTag.href = URL.createObjectURL(blob);
    dlTag.click();
    dlTag.remove();
    URL.revokeObjectURL(dlTag.href);

    isLoading = false;
  };
</script>

<Button size="icon-menu" variant="outline" disabled={isLoading} on:click={downloadImages} title={t("menu.downloadImages", $translations)}>
  {#if isLoading}
  <span class="mx-1">{~~(proper * 100)}%</span><Fa icon={faSpinner} spin />
  {:else}
    <Fa icon={faDownload} />
  {/if}
</Button>
