<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { settings } from "$lib/room/stores";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Separator } from "$lib/components/ui/separator";
  import Switch from "$lib/components/ui/switch/switch.svelte";
  import { faArrowLeft, faTrash } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import { onMount } from "svelte";

  // Default follow rights - bitmask for auto-accept follow requests
  let defaultFollowRights = $settings.default_follow_rights;

  // Notification options (4 event flags)
  const notificationOptions = [
    { eventFlag: 1, labelText: "account.createsPublic" },
    { eventFlag: 2, labelText: "account.createsPrivate" },
    { eventFlag: 4, labelText: "account.joinsPublic" },
    { eventFlag: 8, labelText: "account.joinsPrivate" },
  ];

  // Update settings when rights change
  const handleRightsChange = (eventFlag: number, checked: boolean) => {
    if (checked) {
      defaultFollowRights |= eventFlag;
    } else {
      defaultFollowRights &= ~eventFlag;
    }
    $settings.default_follow_rights = defaultFollowRights;
  };

  const syncRemoval = async (type: "mutelist" | "trustees" | "followers", item: any) => {
    const token = $settings.selected_token;
    if (!token) return true; // Local only if no token

    try {
      const res = await fetch(`/api/token/${token}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: $settings.savedname,
          [type]: [
            {
              id: item.id,
            },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }
      return true;
    } catch (e) {
      console.error(e);
      alert(`Error removing ${type} entry: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  };

  // Trustee management
  $: trustees = $settings.trustees || [];

  const removeTrustee = async (index: number) => {
    const trustee = trustees[index];
    if (await syncRemoval("trustees", trustee)) {
      $settings.trustees = trustees.filter((_, i) => i !== index);
    }
  };

  // Followers management
  $: followers = $settings.followers || [];

  const removeFollower = async (index: number) => {
    const follower = followers[index];
    if (await syncRemoval("followers", follower)) {
      $settings.followers = followers.filter((_, i) => i !== index);
    }
  };

  // Following management
  $: following = $settings.following || [];

  const unfollow = async (index: number) => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub?.endpoint) {
        const res = await fetch(`/api/sub/${encodeURIComponent(sub.endpoint)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deleteIndex: index,
          }),
        });
        if (!res.ok) throw new Error("Failed to unfollow");
      }
      $settings.following = following.filter((_, i) => i !== index);
    } catch (e) {
      console.error(e);
      alert(t("account.failedUnfollow", $translations));
    }
  };

  // Mutelist management
  $: mutelist = $settings.mutelist || [];

  const removeMute = async (index: number) => {
    const entry = mutelist[index];

    if (await syncRemoval("mutelist", entry)) {
      // Queue unmute command
      $settings.pending_mute_commands = [
        ...($settings.pending_mute_commands || []),
        {
          action: "unmute",
          userId: entry.userId,
          userName: entry.userName,
          timestamp: Date.now(),
        },
      ];

      // Remove from mutelist
      $settings.mutelist = mutelist.filter((_, i) => i !== index);
    }
  };

  const formatMuteType = (entry: (typeof mutelist)[0]) => {
    if (entry.type === "asn") {
      return "ASN";
    }
    return `IP (${entry.range || "exact"})`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Restore page title on unmount and sync settings
  onMount(() => {
    const token = $settings.selected_token;
    if (token) {
      (async () => {
        try {
          const res = await fetch(`/api/token/${token}`);
          if (res.ok) {
            const data = await res.json();
            settings.update((s) => {
              s.savedname = data.name || s.savedname;
              s.trustees = (data.trustees || []).map((t: any) => ({
                id: t.id,
                userId: 0,
                userName: t.name,
                timestamp: t.date,
              }));
              s.followers = (data.followers || []).map((f: any) => ({
                id: f.id,
                userId: 0,
                userName: f.name,
                timestamp: f.date,
              }));
              s.mutelist = (data.mutelist || []).map((m: any) => ({
                id: m.id,
                userName: m.name,
                timestamp: m.date,
                type: m.spec ? "ip" : "asn",
                range: m.spec,
              }));
              return s;
            });
          }
        } catch (e) {
          console.error("Failed to sync settings", e);
        }
      })();
    }

    // Fetch following list
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        if (sub?.endpoint) {
          const res = await fetch(`/api/sub/${encodeURIComponent(sub.endpoint)}`);
          if (res.ok) {
            const data = await res.json();
            settings.update((s) => {
              s.following = (data.following || []).map((f: any) => ({
                userId: 0, // Not available in sub data
                userName: f.name,
                timestamp: f.date,
                // we might want to store token/endpoint if needed for more detailed management
              }));
              return s;
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch following", e);
      }
    })();

    return () => {
      document.title = "Jiggie";
    };
  });
</script>

<svelte:head>
  <title>{t("account.title", $translations)} - Jiggie</title>
</svelte:head>

<div class="min-h-screen bg-background">
  <div class="container max-w-4xl mx-auto p-4 md:p-8">
    <!-- Header -->
    <div class="mb-6">
      <Button variant="ghost" href="/" class="mb-4 gap-2">
        <Fa icon={faArrowLeft} />
        <span>{t("account.back", $translations)}</span>
      </Button>
      <h1 class="text-3xl font-bold">{t("account.title", $translations)}</h1>
      <p class="text-muted-foreground mt-2">{t("account.intro", $translations)}</p>
    </div>

    <!-- Default Follow Rights Section -->
    <div class="bg-card rounded-lg border p-6 mb-6">
      <h2 class="text-xl font-semibold mb-2">{t("account.rightsTitle", $translations)}</h2>
      <p class="text-sm text-muted-foreground mb-4">
        {t("account.rightsIntro", $translations)}
      </p>

      <div class="space-y-2">
        {#each notificationOptions as option (option.eventFlag)}
          <div
            class="flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/60 transition-colors duration-150">
            <Label for={`default-${option.eventFlag}`} class="text-sm text-foreground cursor-pointer pr-2">
              {t(option.labelText, $translations)}
            </Label>
            <Switch
              id={`default-${option.eventFlag}`}
              checked={(defaultFollowRights & option.eventFlag) !== 0}
              onCheckedChange={(checked) => handleRightsChange(option.eventFlag, checked)}
              aria-label={t(option.labelText, $translations)} />
          </div>
        {/each}
      </div>

      {#if defaultFollowRights === 0}
        <p class="text-xs text-muted-foreground mt-4 p-3 bg-muted/50 rounded">
          <strong>{t("account.note", $translations)}</strong> {t("account.noRights", $translations)}
        </p>
      {:else}
        <p class="text-xs text-muted-foreground mt-4 p-3 bg-muted/50 rounded">
          <strong>{t("account.note", $translations)}</strong> {t("account.autoAccept", $translations)}
        </p>
      {/if}
    </div>

    <Separator class="my-6" />

    <!-- Trustees Section -->
    <div class="bg-card rounded-lg border p-6 mb-6">
      <h2 class="text-xl font-semibold mb-2">{t("account.trustees", $translations)}</h2>
      <p class="text-sm text-muted-foreground mb-4">
        {t("account.trusteesIntro", $translations)}
      </p>

      {#if trustees.length === 0}
        <div class="text-center py-4 text-muted-foreground text-sm">
          No trustees yet. Promote users in rooms with the trustee checkbox to add them.
        </div>
      {:else}
        <div class="space-y-2">
          {#each trustees as trustee, index (index)}
            <div class="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div class="flex-1">
                <div class="font-medium">{trustee.userName}</div>
                <div class="text-xs text-muted-foreground mt-1">
                  {t("account.added", $translations)} {formatDate(trustee.timestamp)}
                </div>
              </div>
              <Button variant="ghost" size="sm" on:click={() => removeTrustee(index)} class="gap-2 text-destructive hover:text-destructive">
                <Fa icon={faTrash} />
                <span>{t("account.remove", $translations)}</span>
              </Button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <Separator class="my-6" />

    <!-- Followers Section -->
    <div class="bg-card rounded-lg border p-6 mb-6">
      <h2 class="text-xl font-semibold mb-2">{t("account.followers", $translations)}</h2>
      <p class="text-sm text-muted-foreground mb-4">{t("account.followersIntro", $translations)}</p>

      {#if followers.length === 0}
        <div class="text-center py-4 text-muted-foreground text-sm">{t("account.noFollowers", $translations)}</div>
      {:else}
        <div class="space-y-2">
          {#each followers as follower, index (index)}
            <div class="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div class="flex-1">
                <div class="font-medium">{follower.userName}</div>
                <div class="text-xs text-muted-foreground mt-1">
                  {t("account.followingSince", $translations)} {formatDate(follower.timestamp)}
                </div>
              </div>
              <Button variant="ghost" size="sm" on:click={() => removeFollower(index)} class="gap-2 text-destructive hover:text-destructive">
                <Fa icon={faTrash} />
                <span>{t("account.remove", $translations)}</span>
              </Button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <Separator class="my-6" />

    <!-- Following Section -->
    <div class="bg-card rounded-lg border p-6 mb-6">
      <h2 class="text-xl font-semibold mb-2">{t("account.following", $translations)}</h2>
      <p class="text-sm text-muted-foreground mb-4">{t("account.followingIntro", $translations)}</p>

      {#if following.length === 0}
        <div class="text-center py-4 text-muted-foreground text-sm">{t("account.notFollowing", $translations)}</div>
      {:else}
        <div class="space-y-2">
          {#each following as user, index (index)}
            <div class="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div class="flex-1">
                <div class="font-medium">{user.userName}</div>
                <div class="text-xs text-muted-foreground mt-1">
                  {t("account.followingSince", $translations)} {formatDate(user.timestamp)}
                </div>
              </div>
              <Button variant="ghost" size="sm" on:click={() => unfollow(index)} class="gap-2 text-destructive hover:text-destructive">
                <Fa icon={faTrash} />
                <span>{t("account.unfollow", $translations)}</span>
              </Button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <Separator class="my-6" />

    <!-- Mutelist Section -->
    <div class="bg-card rounded-lg border p-6">
      <h2 class="text-xl font-semibold mb-2">{t("account.muted", $translations)}</h2>
      <p class="text-sm text-muted-foreground mb-4">{t("account.mutedIntro", $translations)}</p>

      {#if mutelist.length === 0}
        <div class="text-center py-8 text-muted-foreground">
          <p>{t("account.noMuted", $translations)}</p>
          <p class="text-xs mt-2">{t("account.mutedWillAppear", $translations)}</p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each mutelist as entry, index (index)}
            <div class="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div class="flex-1">
                <div class="font-medium">
                  {entry.userName || `User #${entry.userId || "Unknown"}`}
                </div>
                <div class="text-xs text-muted-foreground mt-1">
                  <span class="font-semibold">{formatMuteType(entry)}</span>
                  <span class="mx-2">•</span>
                  <span>{formatDate(entry.timestamp)}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" on:click={() => removeMute(index)} class="gap-2 text-destructive hover:text-destructive">
                <Fa icon={faTrash} />
                <span>{t("account.unmute", $translations)}</span>
              </Button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
