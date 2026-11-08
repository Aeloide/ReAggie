<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { goto } from "$app/navigation";
  import { fetchBanMessage, type BanMessage } from "./api";
  import banUrl from "$lib/assets/ban-0.png";
  import Footer from "../Footer.svelte";
  import Header from "../Header.svelte";
  import { Button } from "$lib/components/ui/button";

  let loading = true;

  loadBanMessage();
  let data: BanMessage;
  async function loadBanMessage() {
    loading = true;
    const tent = await fetchBanMessage();

    if (!("offense" in tent)) {
      goto("/");
      return;
    }

    data = tent;
    loading = false;
  }

  async function ack() {
    await fetch("/ack");
    goto("/");
  }
</script>

<svelte:head>
  {#if !loading}
    <title>You've been {data.offense}</title>
    <meta name="robots" content="noindex nofollow" />
    <html lang="en" />
  {/if}
</svelte:head>

<section class="container mx-auto max-w-3xl my-4">
  <Header />
  {#if !loading}
    <div class="flex flex-col text-center px-2 gap-y-4 mt-4">
      <h1 class="text-4xl font-bold text-red-500">{t("notice.heading", $translations).replace("{offense}", data.offense)}</h1>
    </div>
    <div class="bg-background my-6 space-y-4 border">
      <div class="flex pt-4 justify-between">
        <div class="flex px-4 pb-4 flex-col">
          <p class="grow">
            {t("notice.reason", $translations).replace("{offense}", data.offense).replace("{reason}", data.reason)}
          </p>
          {#if data.warn}
            <Button on:click={ack} size="lg">{t("notice.understand", $translations)}</Button>
          {/if}
          {#if data.ban}
            <p>
              {t("notice.expires", $translations).replace("{expiration}", data.expiration)}
            </p>
          {/if}
        </div>
        <img src={banUrl} alt="ban" />
      </div>
    </div>
  {/if}
</section>
<Footer />
