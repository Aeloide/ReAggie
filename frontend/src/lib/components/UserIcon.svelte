<script lang="ts">
  import { HostCapabilities, type User } from "$backend/types";
  import { faCircle } from "@fortawesome/free-solid-svg-icons/faCircle";
  import { faSnowflake } from "@fortawesome/free-solid-svg-icons/faSnowflake";
  import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
  import { faShield } from "@fortawesome/free-solid-svg-icons/faShield";
  import Fa from "svelte-fa";

  export let user: User;
  export let size: "sm" | "1x" | "2x" = user.avatar ? "2x" : "1x";

  type Permission = "admin" | "host" | "moderator" | "user";

  $: permission = getPermission(user);
  $: icon = getPermIcon(permission);

  const CapabilitiesDesc: Record<keyof typeof HostCapabilities, string> = {
    ChangeRoomSettings: "Change room settings",
    KickImmune: "Cannot be kicked",
    Kick: "Can Kick and Unkick players",
    Lock: "Can lock access to the room",
    Restart: "Can restart the room process",
    Delete: "Can delete the room",
    SlowMode: "Can turn slowmode on",
    Cleanup: "Can cleanup the room",
    Playlist: "Can manage the playlist",
    Poll: "Can manage polls",
    Rollback: "Can rollback the room state",
    Delegate: "Can delegate these rights to another",

    // admin exclusives, you won't know about these
    ReadBanlist: "",
    Debug: "",
    Ban: "",
    Notes: "Can manage notes",
    // aggregates
    RoomCreator: "",
    Admin: "",
  };

  function getCapDescription(user: User) {
    if (user.isHost.has("Admin")) return "Site Administrator";
    if (user.isHost.has("RoomCreator")) return "Room Host";
    let caps = "";
    for (let i in CapabilitiesDesc) {
      const k = i as keyof typeof HostCapabilities;
      if (user.isHost.has(k)) {
        caps += CapabilitiesDesc[k] + "\n";
      }
    }
    return caps || "Simple User";
  }

  function getPermission(user: User): Permission {
    if (user.isHost.has("Admin")) return "admin";
    if (user.isHost.has("RoomCreator")) return "host";
    if (user.isHost.perms.size > 0) return "moderator"; // Fallback check if any permission exists
    return "user";
  }

  function getPermIcon(permission: Permission) {
    switch (permission) {
      case "admin":
        return faSnowflake;
      case "host":
        return faStar;
      case "moderator":
        return faShield;
      default:
        return faCircle;
    }
  }
  const uniqueId = `clip-${Math.random().toString(36).slice(2, 9)}`;
</script>

<span title={getCapDescription(user)}>
  {#if user.avatar}
    <div class="fa-custom-container" style:width={"4em"} style:height={"4em"}>
      <svg viewBox="0 0 {icon.icon[0]} {icon.icon[1]}" xmlns="http://www.w3.org/2000/svg" class="custom-icon-svg">
        <defs>
          <clipPath id={uniqueId}>
            <path d={icon.icon[4].toString()} />
          </clipPath>
        </defs>

        <image
          width={icon.icon[0]}
          height={icon.icon[1]}
          preserveAspectRatio="xMidYMid slice"
          href={"/assets/pictures/" + user.avatar}
          clip-path={`url(#${uniqueId})`} />

        <path d={icon.icon[4].toString()} fill="none" stroke={user.color} stroke-width={20} stroke-linejoin="round" />
      </svg>
    </div>
  {:else}
    <Fa {icon} {size} fw color={user.color} />
  {/if}
</span>

<style>
  .fa-custom-container {
    margin-block: 0.25em;
  }

  .custom-icon-svg {
    width: 100%;
    height: 100%;
    /* Ensure the stroke doesn't get cut off at the viewBox edges */
    overflow: visible;
  }
</style>
