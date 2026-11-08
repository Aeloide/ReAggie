<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { FaLayers } from "svelte-fa";
  import { faCake } from "@fortawesome/free-solid-svg-icons/faCake";
  import { faHand } from "@fortawesome/free-solid-svg-icons/faHand";
  import { faXmark } from "@fortawesome/free-solid-svg-icons/faXmark";

  import { faBugs } from "@fortawesome/free-solid-svg-icons/faBugs";
  import { faKiss } from "@fortawesome/free-solid-svg-icons/faKiss";

  import { faFaceSmile } from "@fortawesome/free-solid-svg-icons/faFaceSmile";
  import { faLocationCrosshairs } from "@fortawesome/free-solid-svg-icons/faLocationCrosshairs";

  import { game } from "$room";
  // import type { LargeBugManager } from "$room/EntityManager";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import type { JiggieChanManager } from "$room/EntityManager";
  import { bugStore, jigChanStore, jukebox } from "../stores";

  let cancelPat: any;

  function updateCakeState() {
    $jigChanStore.pat = $jigChanStore.pat && $jigChanStore.cake == 0;
  }

  function increaseCake() {
    $jigChanStore.cake += 1;
    updateCakeState();
  }

  function decreaseCake() {
    $jigChanStore.cake -= 1;
    updateCakeState();
  }

  function togglepats() {
    $jigChanStore.pat = !$jigChanStore.pat;
  }

  function togglespawn() {
    $bugStore.spawn = !$bugStore.spawn;
  }

  function togglespawnchuu() {
    $bugStore.spawnchuu = !$bugStore.spawnchuu;
  }

  function spawn() {
    game.connection.chat("/spawn");
  }

  function locate() {
    const jcm = game.entities[0];
    const myjc = jcm.myjc;
    if (!myjc) return;
    game.view.x = -myjc.x + innerWidth / game.view.scale / 2;
    game.view.y = -myjc.y + innerHeight / game.view.scale / 2;
    game.view.updateRoomView();
  }

  // TODO: maybe prevent it from going above your current amount?

  let open = true;
</script>

<Popover.Root bind:open>
  <Popover.Trigger asChild let:builder>
    <div {...builder} on:pointerenter={() => (open = true)} on:pointerleave={() => (open = false)}>
      <Button size="icon-menu" variant="outline" on:click={increaseCake} title={t("menu.feedJigchan", $translations)}>
        <Fa icon={faCake} />
      </Button>
      {#if $jigChanStore.cake > 0}
        <Button size="icon-menu" variant="outline" on:click={decreaseCake} title={t("menu.feedJigchan", $translations)}>
          <FaLayers pull="left">
            <Fa icon={faCake} />
            <Fa color="red" icon={faXmark} />
          </FaLayers>
        </Button>
      {/if}
      <Button size="icon-menu" variant="outline" on:click={togglepats} title={t("menu.patJigchan", $translations)}>
        {#if !$jigChanStore.pat}
          <Fa icon={faHand} />
        {:else}
          <FaLayers pull="left">
            <Fa icon={faHand} />
            <Fa color="red" icon={faXmark} />
          </FaLayers>
        {/if}
      </Button>
      {#if $jigChanStore.myjc === undefined}
      <Button size="icon-menu" variant="outline" on:click={spawn} title={t("menu.spawnJigchan", $translations)}>
        <Fa icon={faFaceSmile} />
      </Button>
    {:else}
        <Button size="icon-menu" variant="outline" on:click={locate} title={t("menu.locateJigchan", $translations)}>
          <Fa icon={faLocationCrosshairs} />
        </Button>
      {/if}
      {#if $jukebox.qty >= 10}
      <Button size="icon-menu" variant="outline" on:click={togglespawn} title={t("menu.largeBugs", $translations)}>
        {#if !$bugStore.spawn}
          <Fa icon={faBugs} />
        {:else}
          <FaLayers pull="left">
            <Fa icon={faBugs} />
            <Fa color="red" icon={faXmark} />
          </FaLayers>
        {/if}
      </Button>
      <Button size="icon-menu" variant="outline" on:click={togglespawnchuu} title={t("menu.chuu", $translations)}>
        {#if !$bugStore.spawnchuu}
          <Fa icon={faKiss} />
        {:else}
          <FaLayers pull="left">
            <Fa icon={faKiss} />
            <Fa color="red" icon={faXmark} />
          </FaLayers>
        {/if}
      </Button>
  {/if}
    </div>
  </Popover.Trigger>
  {#if $jigChanStore.cake > 0}
    <Popover.Content class="px-2 py-1 pointer-events-none size-auto border-none">
      <span class="text-sm">{t("menu.preparingCakes", $translations).replace("{count}", String($jigChanStore.cake))}</span>
    </Popover.Content>
  {/if}
</Popover.Root>
