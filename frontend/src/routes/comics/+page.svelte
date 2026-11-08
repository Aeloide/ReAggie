<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { getUrl } from "$lib";
  import Fa from "svelte-fa";
  import { faEye } from "@fortawesome/free-solid-svg-icons";

  let password = "";

  // Add Comic Form Data
  let newDescription = "";
  let newFile: FileList | null = null;
  let uploadStatus = "";
  let submitting = false;

  async function handleUpload() {
    if (!password) {
      uploadStatus = t("comics.pleasePassword", $translations);
      return;
    }

    if (!newFile || !newFile[0]) {
      uploadStatus = t("comics.pleaseFile", $translations);
      return;
    }

    submitting = true;
    uploadStatus = t("comics.uploading", $translations);
    const formData = new FormData();
    formData.append("token", password);
    formData.append("description", newDescription);
    formData.append("file", newFile[0]);

    try {
      const res = await fetch(getUrl("/api/comic"), {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        uploadStatus = t("comics.uploadSuccess", $translations);
        newDescription = "";
        newFile = null;
        // Force clear the file input if bound variable doesn't do it
        const fileInput = document.getElementById("file") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      } else {
        uploadStatus = t("comics.uploadFailed", $translations) + res.statusText;
      }
    } catch (e) {
      uploadStatus = t("comics.uploadError", $translations);
      console.error(e);
    } finally {
      submitting = false;
    }
  }
</script>

<div class="container mx-auto p-4 max-w-4xl">
  <h1 class="text-3xl font-bold mb-6">{t("comics.title", $translations)}</h1>

  <div class="mt-4 grid gap-6 md:grid-cols-2">
    <div class="space-y-4">
      <div class="grid gap-2">
        <Label for="password">{t("comics.password", $translations)}</Label>
        <Input id="password" type="password" bind:value={password} />
      </div>

      <div class="grid gap-2">
        <Label for="description">{t("comics.descriptionLabel", $translations)}</Label>
        <Textarea id="description" bind:value={newDescription} placeholder={t("comics.descriptionPlaceholder", $translations)} class="min-h-[200px] font-mono" />
      </div>

      <div class="grid gap-2">
        <Label for="file">{t("comics.image", $translations)}</Label>
        <input
          id="file"
          type="file"
          accept="image/*"
          bind:files={newFile}
          class="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50" />
      </div>

      <Button on:click={handleUpload} disabled={!newFile || !newFile[0] || submitting}>
        {#if submitting}
          Uploading...
        {:else}
          Upload Comic
        {/if}
      </Button>

      {#if uploadStatus}
        <p
          class="text-sm font-medium"
          class:text-green-500={uploadStatus.includes("successful")}
          class:text-red-500={uploadStatus.includes("failed") || uploadStatus.includes("Error")}>
          {uploadStatus}
        </p>
      {/if}
    </div>

    <div class="border rounded-lg p-4 bg-card text-card-foreground shadow-sm">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><Fa icon={faEye} /> {t("comics.preview", $translations)}</h3>
      <div class="space-y-4">
        <div>
          <span class="text-sm text-muted-foreground">{t("comics.imagePreview", $translations)}</span>
          {#if newFile && newFile[0]}
            <img src={URL.createObjectURL(newFile[0])} alt={t("comics.preview", $translations)} class="mt-2 max-h-64 rounded border" />
          {:else}
            <div class="mt-2 h-32 w-full border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
              {t("comics.noImage", $translations)}
            </div>
          {/if}
        </div>
        <div>
          <span class="text-sm text-muted-foreground">{t("comics.descriptionPreview", $translations)}</span>
          <div class="mt-2 prose dark:prose-invert max-w-none p-3 border rounded min-h-[100px] bg-muted/50 comic-description">
            {@html newDescription || `<span class="text-muted-foreground italic">${t("comics.descriptionAppears", $translations)}</span>`}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.comic-description a) {
    color: #3b82f6; /* blue-500 */
    text-decoration: underline;
  }
  :global(.comic-description a:hover) {
    color: #2563eb; /* blue-600 */
  }
</style>
