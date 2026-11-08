<script>
  import HelpModal from "./help-modal/HelpModal.svelte";
  import RoomSettingsModal from "./room-settings/RoomSettingsModal.svelte";
  import FollowModal from "./user-follow/FollowModal.svelte";
  import MuteModal from "./user-mute/MuteModal.svelte";
  import RevertModal from "./revert-modal/RevertModal.svelte";
  import PromotionModal from "./user-promotion/PromotionModal.svelte";
  import UserSettingsModal from "./user-settings/UserSettingsModal.svelte";
  import FollowRequestModal from "./user-follow-request/FollowRequestModal.svelte";
</script>

<UserSettingsModal />
<PromotionModal />
<MuteModal />
<FollowModal />
<FollowRequestModal />
<RoomSettingsModal />
<RevertModal />
<HelpModal />
