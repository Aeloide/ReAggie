<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onDestroy, onMount } from "svelte";
  import Header from "../Header.svelte";
  import Footer from "../Footer.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import { toast } from "svelte-sonner";
  import Fa from "svelte-fa";
  import { faBell, faCheck, faCheckDouble, faTrash, faRotateRight, faLock } from "@fortawesome/free-solid-svg-icons";

  const PASS_KEY = "alerts_admin_pass";

  type AlertItem = {
    _id: string;
    time: string;
    sub: string;
    com: string;
    source: "server" | "client";
    ip?: string;
    read: boolean;
  };

  let pass = "";
  let authed = false;
  let loading = false;
  let items: AlertItem[] = [];
  let unread = 0;
  let filter: "all" | "unread" | "server" | "client" = "all";
  let error: string | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  function adminHeaders(extra: Record<string, string> = {}) {
    return {
      "content-type": "application/json;charset=UTF-8",
      "x-admin-pass": pass,
      ...extra,
    };
  }

  async function loadAlerts() {
    if (!pass) return;
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (filter === "unread") params.set("unread", "1");
      if (filter === "server" || filter === "client") params.set("source", filter);
      params.set("limit", "200");
      const res = await fetch(`/api/alerts?${params}`, { headers: adminHeaders() });
      if (res.status === 401) {
        authed = false;
        sessionStorage.removeItem(PASS_KEY);
        error = "Wrong password.";
        return;
      }
      if (!res.ok) {
        error = `Failed to load alerts (${res.status})`;
        return;
      }
      const data = await res.json();
      items = data.items || [];
      unread = data.unread || 0;
      authed = true;
      sessionStorage.setItem(PASS_KEY, pass);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load alerts";
    } finally {
      loading = false;
    }
  }

  async function login(e: SubmitEvent) {
    e.preventDefault();
    await loadAlerts();
    if (authed) toast.success("Inbox unlocked");
  }

  async function markRead(item: AlertItem, read: boolean) {
    const res = await fetch(`/api/alerts/${item._id}`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: JSON.stringify({ read }),
    });
    if (!res.ok) {
      toast.error("Could not update alert");
      return;
    }
    item.read = read;
    items = items;
    await loadAlerts();
  }

  async function remove(item: AlertItem) {
    const res = await fetch(`/api/alerts/${item._id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    if (!res.ok) {
      toast.error("Could not delete alert");
      return;
    }
    items = items.filter((a) => a._id !== item._id);
    await loadAlerts();
  }

  async function markAllRead() {
    const res = await fetch("/api/alerts/read-all", {
      method: "POST",
      headers: adminHeaders(),
      body: "{}",
    });
    if (!res.ok) {
      toast.error("Could not mark all read");
      return;
    }
    toast.success("All alerts marked read");
    await loadAlerts();
  }

  function setFilter(next: AlertItem["source"] | "all" | "unread") {
    filter = next;
    if (authed) void loadAlerts();
  }

  const filterOptions: { id: typeof filter; label: string }[] = [
    { id: "all", label: "alerts.all" },
    { id: "unread", label: "alerts.unreadFilter" },
    { id: "client", label: "alerts.feedback" },
    { id: "server", label: "alerts.server" },
  ];

  function formatTime(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }

  onMount(() => {
    const stored = sessionStorage.getItem(PASS_KEY);
    if (stored) {
      pass = stored;
      void loadAlerts();
    }
    refreshTimer = setInterval(() => {
      if (authed) void loadAlerts();
    }, 15000);
  });

  onDestroy(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });
</script>

<svelte:head>
  <title>{unread ? `(${unread}) ` : ""}{t("alerts.title", $translations)}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="container mx-auto max-w-4xl my-4 px-2">
  <Header />

  {#if !authed}
    <Card class="mt-8 max-w-md mx-auto">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Fa icon={faLock} />
          {t("alerts.inbox", $translations)}
        </CardTitle>
        <CardDescription>
          {t("alerts.description", $translations)}
          <code class="text-xs">/auth</code>
          (MONGOPASS).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="flex flex-col gap-3" on:submit={login}>
          <div class="grid gap-1.5">
            <Label for="admin-pass">{t("alerts.password", $translations)}</Label>
            <Input id="admin-pass" type="password" bind:value={pass} autocomplete="current-password" required />
          </div>
          {#if error}
            <p class="text-sm text-destructive">{error}</p>
          {/if}
          <Button type="submit" disabled={loading || !pass}>{loading ? t("alerts.checking", $translations) : t("alerts.open", $translations)}</Button>
        </form>
      </CardContent>
    </Card>
  {:else}
    <div class="mt-6 flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-2xl font-bold flex items-center gap-2">
            <Fa icon={faBell} />
            {t("alerts.title", $translations)}
            {#if unread > 0}
              <Badge variant="destructive">{unread} {t("alerts.unread", $translations)}</Badge>
            {/if}
          </h2>
          <p class="text-sm text-muted-foreground">{t("alerts.feedbackDesc", $translations)}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" on:click={() => loadAlerts()} disabled={loading}>
            <Fa icon={faRotateRight} class="mr-2" />
            {t("alerts.refresh", $translations)}
          </Button>
          <Button size="sm" variant="secondary" on:click={markAllRead} disabled={unread === 0}>
            <Fa icon={faCheckDouble} class="mr-2" />
            {t("alerts.markAll", $translations)}
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        {#each filterOptions as option}
          <Button size="sm" variant={filter === option.id ? "default" : "outline"} on:click={() => setFilter(option.id)}>
            {t(option.label, $translations)}
          </Button>
        {/each}
      </div>

      <Separator />

      {#if loading && items.length === 0}
        <p class="text-sm text-muted-foreground">{t("alerts.loading", $translations)}</p>
      {:else if items.length === 0}
        <p class="text-sm text-muted-foreground text-center py-8">{t("alerts.none", $translations)}</p>
      {:else}
        <div class="flex flex-col gap-3">
          {#each items as item (item._id)}
            <Card class={item.read ? "opacity-75" : "border-primary/40"}>
              <CardHeader class="p-4 pb-2">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <CardTitle class="text-base break-words">{item.sub || t("alerts.noSubject", $translations)}</CardTitle>
                    <CardDescription class="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{formatTime(item.time)}</span>
                      {#if item.ip}
                        <span class="font-mono">{item.ip}</span>
                      {/if}
                    </CardDescription>
                  </div>
                  <Badge variant={item.source === "client" ? "default" : "secondary"}>
                    {item.source === "client" ? t("alerts.feedback", $translations) : t("alerts.server", $translations)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent class="p-4 pt-2">
                <pre class="whitespace-pre-wrap break-words text-sm bg-muted/40 rounded-md p-3 max-h-72 overflow-auto">{item.com}</pre>
                <div class="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" on:click={() => markRead(item, !item.read)}>
                    <Fa icon={faCheck} class="mr-2" />
                    {item.read ? "Mark unread" : "Mark read"}
                  </Button>
                  <Button size="sm" variant="destructive" on:click={() => remove(item)}>
                    <Fa icon={faTrash} class="mr-2" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>
<Footer />
