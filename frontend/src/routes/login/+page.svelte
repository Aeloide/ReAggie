<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { page } from "$app/stores";
  import { Button } from "$lib/components/ui/button";
  import { faDiscord } from "@fortawesome/free-brands-svg-icons/faDiscord";
  import { faTwitch } from "@fortawesome/free-brands-svg-icons/faTwitch";
  import Fa from "svelte-fa";
  import Header from "../Header.svelte";

  function doAuth(method: string) {
    const roomId = $page.url.searchParams.get("room");
    location.pathname = `/oauth/${method}/${roomId}`;
  }
</script>

<svelte:head>
  <meta name="robots" content="noindex nofollow" />
  <html lang="en" />
</svelte:head>

<section class="container mx-auto max-w-3xl my-4">
  <Header />
  <div class="flex flex-col text-center px-2 gap-y-4 mt-4">
    <h1 class="text-4xl font-bold text-red-500">{t("login.title", $translations)}</h1>
  </div>
  <div class="bg-background my-6 space-y-4 border">
    <div class="flex py-4 px-4 justify-center">
      <div class="flex flex-col gap-4">
        <p class="grow">{t("login.description", $translations)}</p>
        <div class="flex flex-col sm:flex-row justify-center gap-4">
          <Button size="lg" variant="ghost" on:click={() => doAuth("twitch")} class="gap-1 bg-[rgb(145,71,255)] hover:bg-[rgb(145,71,255)]">
            <Fa icon={faTwitch} size="lg" />
            Log in with Twitch
          </Button>
          <Button size="lg" variant="ghost" on:click={() => doAuth("discord")} class="gap-1 bg-[rgb(88,101,242)] hover:bg-[rgb(88,101,242)]">
            <Fa icon={faDiscord} size="lg" />
            Log in with Discord
          </Button>
        </div>
      </div>
    </div>
  </div>
</section>
